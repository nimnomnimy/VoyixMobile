import { create } from 'zustand';
import { bff } from '../lib/bffClient';

export type LoyaltyCardType = 'flybuys' | 'teamMember' | 'onepass';

export interface LoyaltyAccount {
  cardNumber: string;
  accountId: string;
  memberName: string;
  pointsBalance: number;
  tier: string;
}

interface LoyaltyState {
  flybuys: LoyaltyAccount | null;
  teamMember: LoyaltyAccount | null;
  onepass: LoyaltyAccount | null;
  loyaltyAdded: boolean;
  setCard: (type: LoyaltyCardType, cardNumber: string) => boolean; // returns true if replaced
  clearAll: () => void;
  setLoyaltyAdded: (val: boolean) => void; // kept for backward compat
}

export const useLoyaltyStore = create<LoyaltyState>((set, get) => ({
  flybuys: null,
  teamMember: null,
  onepass: null,
  loyaltyAdded: false,

  setCard: (type, cardNumber) => {
    const wasAlreadySet = get()[type] !== null;
    // Optimistic: store card immediately with placeholder while we look up the account
    const placeholder: LoyaltyAccount = {
      cardNumber,
      accountId: cardNumber,
      memberName: 'Looking up...',
      pointsBalance: 0,
      tier: 'Standard',
    };
    set({ [type]: placeholder, loyaltyAdded: true });

    // BSP identify in background — update with real account data when ready
    void bff
      .post<{ accountId: string; memberName: string; pointsBalance: number; tier: string }>(
        '/api/loyalty/identify',
        { cardNumber, cardType: type },
      )
      .then((data) => {
        set({
          [type]: {
            cardNumber,
            accountId: data.accountId,
            memberName: data.memberName,
            pointsBalance: data.pointsBalance,
            tier: data.tier,
          } as LoyaltyAccount,
        });
      })
      .catch(() => {
        // BSP unavailable — keep card active with generic member name
        set({ [type]: { ...placeholder, memberName: 'Member' } as LoyaltyAccount });
      });

    return wasAlreadySet;
  },

  clearAll: () => set({ flybuys: null, teamMember: null, onepass: null, loyaltyAdded: false }),

  setLoyaltyAdded: (val) => set({ loyaltyAdded: val }),
}));
