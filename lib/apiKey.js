import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'anthropic_api_key_override';
const ENV_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

export async function getApiKey() {
  const override = await AsyncStorage.getItem(STORAGE_KEY);
  return (override?.trim()) || ENV_KEY || '';
}

export async function setApiKey(key) {
  if (!key?.trim()) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, key.trim());
  }
}

export async function clearApiKeyOverride() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function getApiKeySource() {
  const override = await AsyncStorage.getItem(STORAGE_KEY);
  return override?.trim() ? 'manual' : 'env';
}

export function maskKey(key) {
  if (!key || key.length < 10) return '—';
  return `${key.substring(0, 16)}${'•'.repeat(10)}${key.slice(-4)}`;
}
