import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Add new feature flags here — they default to true and appear in Settings > Config automatically
export const FEATURES = {
  chatHistory:            { label: 'Chat History',            desc: 'Save & revisit past conversations in Insights' },
  chatSuggestions:        { label: 'Quick Suggestions',       desc: 'Show suggestion chips in the Insights chat' },
  aiTips:                 { label: 'AI Savings Tips',         desc: 'Generate personalised saving tips in Insights' },
  subscriptionDetection:  { label: 'Subscription Detection',  desc: 'Auto-detect recurring charges in Analytics' },
  merchantTrends:         { label: 'Merchant Trends',         desc: 'Search and chart spending per merchant in Analytics' },
};

const STORAGE_KEY = 'feature_flags';

const defaults = Object.fromEntries(Object.keys(FEATURES).map(k => [k, true]));

const FeatureContext = createContext(null);

export function FeatureProvider({ children }) {
  const [flags, setFlags] = useState(defaults);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) setFlags({ ...defaults, ...JSON.parse(raw) });
    });
  }, []);

  const toggle = async (key) => {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <FeatureContext.Provider value={{ flags, toggle }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  return useContext(FeatureContext);
}
