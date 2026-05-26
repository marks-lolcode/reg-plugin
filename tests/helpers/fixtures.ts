import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export type FixturePage = "attendeeEdit" | "eventRegDetails";

export interface AttendeeFixture {
  name: string;
  page: "attendeeEdit";
  accountId: string;
  attendeeId: string;
  expect: {
    state: "green" | "yellow" | "red";
    ticket?: string;
    conditions: string[];
  };
}

export interface RegistrationsFixture {
  name: string;
  page: "eventRegDetails";
  registrationId: string;
  expect: {
    rowCount: number;
    states: Array<"green" | "yellow" | "red">;
  };
}

export type Fixture = AttendeeFixture | RegistrationsFixture;

const FIXTURE_PATH = path.resolve(__dirname, "..", "fixtures", "attendees.yaml");

export function loadFixtures(): Fixture[] {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  const parsed = yaml.load(raw) as Fixture[] | null;
  return parsed ?? [];
}

export function attendeeFixtures(): AttendeeFixture[] {
  return loadFixtures().filter(
    (f): f is AttendeeFixture =>
      f.page === "attendeeEdit" && !!f.accountId && !!f.attendeeId,
  );
}

export function registrationsFixtures(): RegistrationsFixture[] {
  return loadFixtures().filter(
    (f): f is RegistrationsFixture =>
      f.page === "eventRegDetails" && !!f.registrationId,
  );
}

export function attendeeEditUrl(fx: AttendeeFixture, baseURL: string): string {
  return `${baseURL}/np/admin/event/attendeeEdit.do?id=${fx.attendeeId}&accountId=${fx.accountId}`;
}

export function eventRegDetailsUrl(fx: RegistrationsFixture, baseURL: string): string {
  return `${baseURL}/np/admin/event/eventRegDetails.do?id=${fx.registrationId}`;
}
