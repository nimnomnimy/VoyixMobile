import React from 'react';
import { TouchableOpacity, Image, View, Alert, Text, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { useOrderStore } from '../store/useOrderStore';

import LoginScreen from '../screens/LoginScreen';
import ScanScreen from '../screens/ScanScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderConfirmationScreen from '../screens/OrderConfirmationScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ApiLogScreen from '../screens/ApiLogScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const navigation = useNavigation<any>();
  const logout = useAuthStore((state) => state.logout);
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const clearCart = useCartStore((state) => state.clearCart);
  const suspendOrder = useOrderStore((state) => state.suspendOrder);

  const flybuys = useLoyaltyStore((state) => state.flybuys);
  const teamMember = useLoyaltyStore((state) => state.teamMember);
  const onepass = useLoyaltyStore((state) => state.onepass);
  const handleSessionMenu = () => {
    Alert.alert('Session', 'Choose an option', [
      {
        text: 'Suspend Transaction',
        onPress: () => {
          if (items.length === 0) {
            Alert.alert('Nothing to suspend', 'Add items to the cart first.');
            return;
          }
          const id = 'SUS-' + Math.random().toString(36).substring(2, 7).toUpperCase();
          const total = items.reduce((s, i) => s + i.price * i.quantity, 0) * 1.10;
          suspendOrder({
            id,
            total,
            refundedTotal: 0,
            itemCount: items.reduce((s, i) => s + i.quantity, 0),
            timestamp: new Date().toLocaleString(),
            status: 'suspended',
            items: items.map((i) => ({ ...i, refundedQty: 0 })),
          });
          clearCart();
          Alert.alert('Suspended', `Transaction ${id} has been suspended.`);
        },
      },
      {
        text: 'Void Transaction',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Void Transaction',
            'This will clear the cart and loyalty cards. Are you sure?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Void',
                style: 'destructive',
                onPress: () => {
                  clearCart();
                },
              },
            ]
          );
        },
      },
      {
        text: 'View API Log',
        onPress: () => navigation.navigate('ApiLog'),
      },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Log Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: logout },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#CC0000',
        tabBarInactiveTintColor: '#999999',
        headerLeft: () => (
          <Image
            source={require('../../assets/kmart-logo.png')}
            style={{ width: 80, height: 28, resizeMode: 'contain', marginLeft: 12 }}
          />
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 8 }}>
            {flybuys && (
              <Image
                source={require('../../assets/flybuys-logo.png')}
                style={{ width: 56, height: 20, resizeMode: 'contain' }}
              />
            )}
            {teamMember && (
              <View style={styles.headerCardBadge}>
                <Text style={styles.headerCardBadgeText}>TM</Text>
              </View>
            )}
            {onepass && (
              <View style={[styles.headerCardBadge, { backgroundColor: '#6B21A8' }]}>
                <Text style={styles.headerCardBadgeText}>OP</Text>
              </View>
            )}
            <TouchableOpacity onPress={handleSessionMenu}>
              <Ionicons name="log-out-outline" size={24} color="#CC0000" />
            </TouchableOpacity>
          </View>
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
  );
}

export default function RootNavigator() {
  const token = useAuthStore((state) => state.token);

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
