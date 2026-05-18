import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { FONTS } from './constants/theme';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { FeatureProvider } from './lib/FeatureContext';
import DashboardScreen from './screens/DashboardScreen';
import UploadScreen from './screens/UploadScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import InsightsScreen from './screens/InsightsScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Dashboard: ['home', 'home-outline'],
  Upload: ['cloud-upload', 'cloud-upload-outline'],
  Transactions: ['list', 'list-outline'],
  Analytics: ['bar-chart', 'bar-chart-outline'],
  Insights: ['bulb', 'bulb-outline'],
  Settings: ['settings', 'settings-outline'],
};

async function checkForUpdate() {
  try {
    if (!Updates.isEnabled) return;
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (e) {
    console.log('[OTA] update check failed:', e?.message);
  }
}

function ThemedApp() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => { checkForUpdate(); }, []);

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              const [active, inactive] = TAB_ICONS[route.name] ?? ['circle', 'circle-outline'];
              return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textTertiary,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 60 + insets.bottom,
              paddingBottom: insets.bottom + 8,
            },
            tabBarLabelStyle: { fontSize: FONTS.xs },
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700', fontSize: FONTS.lg },
            headerShadowVisible: false,
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
          <Tab.Screen name="Upload" component={UploadScreen} options={{ title: 'Upload' }} />
          <Tab.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
          <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
          <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights' }} />
          <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeatureProvider>
          <ThemedApp />
        </FeatureProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
