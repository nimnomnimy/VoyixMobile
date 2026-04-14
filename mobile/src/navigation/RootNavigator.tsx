import React, { useEffect, useState } from 'react';
import {
  TouchableOpacity, Image, View, Text, StyleSheet,
  Modal, ScrollView, SafeAreaView, Platform,
} from 'react-native';
import { showAlert } from '../lib/webAlert';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import { useOrderStore } from '../store/useOrderStore';
import { bff } from '../lib/bffClient';

import LoginScreen from '../screens/LoginScreen';
import ScanScreen from '../screens/ScanScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderConfirmationScreen from '../screens/OrderConfirmationScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ApiLogScreen from '../screens/ApiLogScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type MenuOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

function SessionMenu({
  visible,
  title,
  onClose,
  options,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: MenuOption[];
}) {
  if (Platform.OS === 'web') return null; // web uses showAlert prompt fallback

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={onClose} />
      <SafeAreaView style={sheet.container}>
        <View style={sheet.handle} />
        <Text style={sheet.title}>{title}</Text>
        <ScrollView bounces={false}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[sheet.row, i < options.length - 1 && sheet.rowBorder]}
              onPress={() => { onClose(); opt.onPress(); }}
            >
              <Text style={[sheet.rowText, opt.destructive && sheet.rowDestructive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={sheet.cancel} onPress={onClose}>
          <Text style={sheet.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

function MainTabs() {
  const navigation = useNavigation<any>();
  const logout = useAuthStore((state) => state.logout);
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const clearCart = useCartStore((state) => state.clearCart);
  const suspendOrder = useOrderStore((state) => state.suspendOrder);

  const appVersion = Constants.expoConfig?.version ?? '?';
  const updateId = Updates.updateId ? Updates.updateId.slice(0, 8) : 'local';

  const [menuVisible, setMenuVisible] = useState(false);

  const menuOptions: MenuOption[] = [
    {
      label: 'Suspend Transaction',
      onPress: () => {
        if (items.length === 0) {
          showAlert('Nothing to suspend', 'Add items to the cart first.');
          return;
        }
        const cartStore = require('../store/useCartStore').useCartStore.getState();
        const bspOrderId = cartStore.bspOrderId;
        const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const orderItems = items.map((i) => ({ ...i, refundedQty: 0 }));

        if (bspOrderId) {
          // BSP-backed suspend — PATCH to InProgress and store loyalty state
          // in BFF memory so any terminal can restore it on resume.
          const { useLoyaltyStore: ls } = require('../store/useLoyaltyStore');
          const loyaltyState = ls.getState();
          const loyaltyPayload = {
            flybuys:    loyaltyState.flybuys    ? { cardNumber: loyaltyState.flybuys.cardNumber,    accountId: loyaltyState.flybuys.accountId,    memberName: loyaltyState.flybuys.memberName    } : null,
            teamMember: loyaltyState.teamMember ? { cardNumber: loyaltyState.teamMember.cardNumber, accountId: loyaltyState.teamMember.accountId, memberName: loyaltyState.teamMember.memberName } : null,
            onepass:    loyaltyState.onepass    ? { cardNumber: loyaltyState.onepass.cardNumber,    accountId: loyaltyState.onepass.accountId,    memberName: loyaltyState.onepass.memberName    } : null,
          };
          bff.post(`/api/cart/${bspOrderId}/suspend`, loyaltyPayload)
            .catch(() => {}); // fire-and-forget; local suspend still happens
          suspendOrder({
            id: bspOrderId,
            bspOrderId,
            total,
            refundedTotal: 0,
            itemCount: items.reduce((s, i) => s + i.quantity, 0),
            timestamp: new Date().toLocaleString(),
            status: 'suspended',
            items: orderItems,
          });
          // Clear local cart state only (don't cancel BSP order)
          cartStore.clearCartLocal();
          const { useLoyaltyStore } = require('../store/useLoyaltyStore');
          useLoyaltyStore.getState().clearAll();
        } else {
          // No BSP order yet — local-only suspend
          const id = 'SUS-' + Math.random().toString(36).substring(2, 7).toUpperCase();
          suspendOrder({
            id,
            total,
            refundedTotal: 0,
            itemCount: items.reduce((s, i) => s + i.quantity, 0),
            timestamp: new Date().toLocaleString(),
            status: 'suspended',
            items: orderItems,
          });
          clearCart();
        }
        showAlert('Suspended', 'Transaction suspended. Recall it from the Orders tab on any terminal.');
      },
    },
    {
      label: 'Void Transaction',
      destructive: true,
      onPress: () => {
        showAlert(
          'Void Transaction',
          'This will clear the cart and loyalty cards. Are you sure?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Void', style: 'destructive', onPress: () => { clearCart(); } },
          ]
        );
      },
    },
    {
      label: 'Check for Updates',
      onPress: async () => {
        if (__DEV__) {
          showAlert('Updates', 'Update checks are disabled in dev mode.');
          return;
        }
        try {
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) {
            showAlert('Update Available', 'Downloading update…');
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          } else {
            showAlert('Up to Date', `No update available.\nVersion: v${appVersion} (${updateId})`);
          }
        } catch (e: any) {
          showAlert('Update Failed', e?.message ?? 'Could not check for updates.');
        }
      },
    },
    {
      label: 'View API Log',
      onPress: () => navigation.navigate('ApiLog'),
    },
    {
      label: 'Settings',
      onPress: () => navigation.navigate('Settings'),
    },
    {
      label: 'Log Out',
      destructive: true,
      onPress: () => {
        showAlert('Log Out', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: logout },
        ]);
      },
    },
  ];

  const handleSessionMenu = () => {
    if (Platform.OS === 'web') {
      // Keep web prompt fallback
      showAlert(`Session  v${appVersion} (${updateId})`, 'Choose an option', [
        ...menuOptions.map((o) => ({ text: o.label, style: o.destructive ? 'destructive' as const : 'default' as const, onPress: o.onPress })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    } else {
      setMenuVisible(true);
    }
  };

  return (
    <>
      <SessionMenu
        visible={menuVisible}
        title={`Session  v${appVersion} (${updateId})`}
        onClose={() => setMenuVisible(false)}
        options={menuOptions}
      />
      <Tab.Navigator
        id={undefined}
        screenOptions={{
          headerShown: true,
          headerStatusBarHeight: Platform.OS === 'android' ? 0 : undefined,
          headerTitleAlign: 'center',
          tabBarActiveTintColor: '#CC0000',
          tabBarInactiveTintColor: '#999999',
          headerLeft: () => (
            <Image
              source={require('../../assets/kmart-logo.png')}
              style={{ width: 80, height: 28, resizeMode: 'contain', marginLeft: 12 }}
            />
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleSessionMenu} style={{ marginRight: 12 }}>
              <Ionicons name="log-out-outline" size={24} color="#CC0000" />
            </TouchableOpacity>
          ),
        }}
      >
        <Tab.Screen
          name="Cart"
          component={CartScreen}
          options={{
            title: 'Cart',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cart-outline" size={size} color={color} />
            ),
            tabBarBadge: itemCount > 0 ? itemCount : undefined,
            tabBarBadgeStyle: { backgroundColor: '#CC0000' },
          }}
        />
        <Tab.Screen
          name="Scan"
          component={ScanScreen}
          options={{
            title: 'Item Lookup',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt-outline" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </>
  );
}

export default function RootNavigator() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silently ignore — update failures must never block the app
      }
    })();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
        {!token ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Checkout"
              component={CheckoutScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="OrderConfirmation"
              component={OrderConfirmationScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="OrderDetail"
              component={OrderDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ApiLog"
              component={ApiLogScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerCardBadge: {
    backgroundColor: '#FF6B00',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  headerCardBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
  },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowText: {
    fontSize: 17,
    color: '#000',
    textAlign: 'center',
  },
  rowDestructive: {
    color: '#CC0000',
  },
  cancel: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
});
