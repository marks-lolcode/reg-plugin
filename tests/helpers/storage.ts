import { Worker } from "@playwright/test";

// Mirror of STORAGE_KEY in js/constants.js — kept inline because the
// extension's constants.js is a non-module script and can't be imported.
export const STORAGE_KEY = {
  ATTENDEE: "attendee",
  REGISTRATIONS: "registrations",
  ACCOUNT: "account",
  MANAGEMENT_OVERRIDE: "managementOverride",
  AGE_VERIFIED: "ageVerified",
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  REGISTRATION_ERROR: "REGISTRATION_ERROR",
} as const;

export const ACTION = {
  GET_ATTENDEE_DATA: "Get Attendee Data",
  GET_REGISTRATIONS: "Get Registrations Data",
  GET_ACCOUNT_DATA: "Get Account Data",
  INCREMENT_BADGE_COUNT: "Increment Badge Count",
  HIGHLIGHT_ICE_FIELD: "Highlight ICE Field",
  NAVIGATE_TO_EVENT_REG: "Navigate To Event Reg",
} as const;

export interface AttendeeReason {
  key: string;
  text: string;
  isRed: boolean;
  fixable: boolean;
}

export interface AttendeeState {
  accountId?: string;
  attendeeId?: string;
  name?: string;
  badgeName?: string;
  badgeImage?: string;
  ticket?: string;
  activeBadges?: number;
  regStatus?: string;
  state?: "green" | "yellow" | "red";
  reasons?: AttendeeReason[];
}

export async function readStorage<T = unknown>(
  serviceWorker: Worker,
  key: string,
): Promise<T | undefined> {
  const value = await serviceWorker.evaluate(async (k) => {
    const result = await chrome.storage.local.get(k);
    return result[k];
  }, key);
  return value as T | undefined;
}

export async function clearStorage(serviceWorker: Worker, key: string): Promise<void> {
  await serviceWorker.evaluate(async (k) => {
    await chrome.storage.local.remove(k);
  }, key);
}

export async function setStorage(
  serviceWorker: Worker,
  key: string,
  value: unknown,
): Promise<void> {
  await serviceWorker.evaluate(async ([k, v]) => {
    await chrome.storage.local.set({ [k as string]: v });
  }, [key, value]);
}

export function reasonKeys(state: AttendeeState | undefined): string[] {
  return (state?.reasons ?? []).map((r) => r.key).sort();
}
