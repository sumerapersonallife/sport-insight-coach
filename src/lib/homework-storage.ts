import type { CoachResult } from "@/lib/coach.functions";
import type { HomeworkStatus, Sport, SessionDurationHours } from "@/lib/session-rules";

const DATABASE_NAME = "still-ballin-local";
const DATABASE_VERSION = 1;

export type HomeworkRecord = {
  id: string;
  sport: Sport;
  title: string;
  instruction: string;
  assignedAt: number;
  status: HomeworkStatus;
  fileName: string | null;
  videoBlob: Blob | null;
  review: CoachResult | null;
};

export type SessionRecord = {
  id: string;
  sport: Sport;
  durationHours: SessionDurationHours;
  startedAt: number;
  endedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("homework")) {
        database.createObjectStore("homework", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("sessions")) {
        database.createObjectStore("sessions", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser storage failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage was interrupted"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read browser storage"));
  });
}

export async function saveHomework(record: HomeworkRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("homework", "readwrite");
    transaction.objectStore("homework").put(record);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function latestHomework() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("homework", "readonly");
    const records = await requestResult(transaction.objectStore("homework").getAll<HomeworkRecord>());
    await transactionComplete(transaction);
    return records.sort((a, b) => b.assignedAt - a.assignedAt)[0] ?? null;
  } finally {
    database.close();
  }
}

export async function saveSession(record: SessionRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("sessions", "readwrite");
    transaction.objectStore("sessions").put(record);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function saveCompletedSession(session: SessionRecord, homework: HomeworkRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(["sessions", "homework"], "readwrite");
    transaction.objectStore("sessions").put(session);
    transaction.objectStore("homework").put(homework);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function listSessions() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("sessions", "readonly");
    const records = await requestResult(transaction.objectStore("sessions").getAll<SessionRecord>());
    await transactionComplete(transaction);
    return records.sort((a, b) => b.startedAt - a.startedAt);
  } finally {
    database.close();
  }
}