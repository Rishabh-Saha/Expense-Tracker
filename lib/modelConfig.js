import AsyncStorage from '@react-native-async-storage/async-storage';
import { MODELS, DEFAULT_MODEL_ID } from '../constants/models';

const MODEL_KEY = 'selected_model_id';
const OPENAI_KEY = 'openai_api_key';

export async function getSelectedModel() {
  const id = await AsyncStorage.getItem(MODEL_KEY);
  return MODELS.find(m => m.id === id) ?? MODELS.find(m => m.isDefault) ?? MODELS[0];
}

export async function getSelectedModelId() {
  return (await AsyncStorage.getItem(MODEL_KEY)) ?? DEFAULT_MODEL_ID;
}

export async function setSelectedModelId(id) {
  await AsyncStorage.setItem(MODEL_KEY, id);
}

export async function getOpenAIKey() {
  const key = await AsyncStorage.getItem(OPENAI_KEY);
  return key?.trim() ?? '';
}

export async function setOpenAIKey(key) {
  if (!key?.trim()) {
    await AsyncStorage.removeItem(OPENAI_KEY);
  } else {
    await AsyncStorage.setItem(OPENAI_KEY, key.trim());
  }
}
