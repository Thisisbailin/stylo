import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RemoteConflictAcceptedError,
  SyncProtocolError,
  VersionedSyncEngine,
  type SyncBaseline,
  type VersionedSaveRequest,
  type VersionedSyncTransport,
} from "../sync/versionedSyncEngine";

type TestDocument = {
  revision: number;
  text: string;
};

const codec = {
  snapshot: (value: TestDocument) => JSON.parse(JSON.stringify(value)) as TestDocument,
  fingerprint: (value: TestDocument) => JSON.stringify(value),
  validate: (value: TestDocument) =>
    Number.isSafeInteger(value.revision) && value.revision >= 0 ? null : "invalid revision",
  isEmpty: (value: TestDocument) => !value.text,
  revision: (value: TestDocument) => value.revision,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const createBaselineStore = (initial: SyncBaseline | null = null) => {
  let value = initial;
  return {
    read: () => value,
    write: (next: SyncBaseline) => {
      value = next;
    },
    get: () => value,
  };
};

const createEngine = (
  transport: VersionedSyncTransport<TestDocument>,
  options: {
    onApplyRemote?: (remote: TestDocument) => void;
    onConflict?: () => Promise<"remote" | "local">;
    createOperationId?: () => string;
    baseline?: ReturnType<typeof createBaselineStore>;
    debounceMs?: number;
  } = {}
) => new VersionedSyncEngine<TestDocument>({
  transport,
  codec,
  baselineStore: options.baseline || createBaselineStore(),
  onApplyRemote: (remote) => options.onApplyRemote?.(remote),
  onConflict: options.onConflict || (async () => "local"),
  debounceMs: options.debounceMs ?? 0,
  retryBaseMs: 0,
  sleep: async () => undefined,
  random: () => 0,
  createOperationId: options.createOperationId,
});

test("initial handshake applies a non-empty remote snapshot without pushing local empty state", async () => {
  let saves = 0;
  let applied: TestDocument | null = null;
  const engine = createEngine({
    load: async () => ({ value: { revision: 4, text: "remote" }, version: 40 }),
    save: async () => {
      saves += 1;
      throw new Error("must not save");
    },
  }, {
    onApplyRemote: (remote) => {
      applied = remote;
    },
  });

  await engine.start({ revision: 0, text: "" });

  assert.deepEqual(applied, { revision: 4, text: "remote" });
  assert.equal(saves, 0);
  engine.dispose();
});

test("writes are immutable, serialized, and background staging waits for an Agent lease", async () => {
  const requests: VersionedSaveRequest<TestDocument>[] = [];
  let releaseFirstSave: () => void = () => {
    throw new Error("first save did not start");
  };
  let activeSaves = 0;
  let maxActiveSaves = 0;
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 10 }),
    save: async (request) => {
      requests.push(request);
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      }
      activeSaves -= 1;
      return {
        kind: "saved" as const,
        version: 10 + requests.length,
        revision: request.value.revision,
      };
    },
  });
  await engine.start({ revision: 1, text: "base" });

  const agentSnapshot = { revision: 2, text: "agent" };
  const leasePromise = engine.acquire(agentSnapshot, 2);
  agentSnapshot.text = "mutated-after-submit";
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].value.text, "agent");
  releaseFirstSave();
  const lease = await leasePromise;

  engine.stage({ revision: 3, text: "later edit" });
  await tick();
  assert.equal(requests.length, 1, "lease must block later background writes");
  lease.release();
  await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].value.text, "later edit");
  assert.equal(maxActiveSaves, 1);
  engine.dispose();
});

test("reverting before debounce invalidates the stale staged write", async () => {
  let saves = 0;
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 10 }),
    save: async () => {
      saves += 1;
      return { kind: "saved" as const, version: 11, revision: 2 };
    },
  }, { debounceMs: 20 });
  await engine.start({ revision: 1, text: "base" });

  engine.stage({ revision: 2, text: "temporary" });
  engine.stage({ revision: 1, text: "base" });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(saves, 0);
  engine.dispose();
});

test("reverting during an in-flight write queues a compensating write", async () => {
  const requests: VersionedSaveRequest<TestDocument>[] = [];
  let releaseFirstSave: () => void = () => {
    throw new Error("first save did not start");
  };
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 10 }),
    save: async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      }
      return {
        kind: "saved" as const,
        version: 10 + requests.length,
        revision: request.value.revision,
      };
    },
  });
  await engine.start({ revision: 1, text: "base" });

  engine.stage({ revision: 2, text: "temporary" });
  await tick();
  engine.stage({ revision: 1, text: "base" });
  releaseFirstSave();
  await tick();

  assert.deepEqual(requests.map((request) => request.value.text), ["temporary", "base"]);
  engine.dispose();
});

test("keeping local after a CAS conflict retries from the returned remote version with a new op id", async () => {
  const requests: VersionedSaveRequest<TestDocument>[] = [];
  let opSequence = 0;
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 4 }),
    save: async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        return {
          kind: "conflict" as const,
          remote: { value: { revision: 2, text: "other device" }, version: 5 },
        };
      }
      return { kind: "saved" as const, version: 6, revision: request.value.revision };
    },
  }, {
    onConflict: async () => "local",
    createOperationId: () => `op-${++opSequence}`,
  });
  await engine.start({ revision: 1, text: "base" });

  const lease = await engine.acquire({ revision: 3, text: "mine" }, 3);

  assert.deepEqual(requests.map((request) => request.baseVersion), [4, 5]);
  assert.deepEqual(requests.map((request) => request.operationId), ["op-1", "op-2"]);
  lease.release();
  engine.dispose();
});

test("choosing remote during an explicit push cancels the Agent request and applies remote", async () => {
  let applied: TestDocument | null = null;
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 2 }),
    save: async () => ({
      kind: "conflict" as const,
      remote: { value: { revision: 4, text: "remote" }, version: 3 },
    }),
  }, {
    onApplyRemote: (remote) => {
      applied = remote;
    },
    onConflict: async () => "remote",
  });
  await engine.start({ revision: 1, text: "base" });

  await assert.rejects(
    engine.acquire({ revision: 2, text: "local" }, 2),
    RemoteConflictAcceptedError
  );
  assert.deepEqual(applied, { revision: 4, text: "remote" });
  engine.dispose();
});

test("retry reuses the same immutable operation id and payload", async () => {
  const requests: VersionedSaveRequest<TestDocument>[] = [];
  const retryableError = Object.assign(new Error("temporary"), { retryable: true });
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 7 }),
    save: async (request) => {
      requests.push(request);
      if (requests.length === 1) throw retryableError;
      return { kind: "saved" as const, version: 8, revision: 2 };
    },
  }, { createOperationId: () => "stable-op" });
  await engine.start({ revision: 1, text: "base" });

  const lease = await engine.acquire({ revision: 2, text: "next" }, 2);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].operationId, "stable-op");
  assert.equal(requests[1].operationId, "stable-op");
  assert.deepEqual(requests[0].value, requests[1].value);
  lease.release();
  engine.dispose();
});

test("disposing an account aborts its in-flight handshake and prevents stale remote application", async () => {
  let applied = false;
  const engine = createEngine({
    load: (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
    save: async () => {
      throw new Error("must not save");
    },
  }, {
    onApplyRemote: () => {
      applied = true;
    },
  });
  const started = engine.start({ revision: 0, text: "" });

  engine.dispose();

  await assert.rejects(started, (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError"
  );
  assert.equal(applied, false);
});

test("an unconfirmed server revision is a protocol failure", async () => {
  const engine = createEngine({
    load: async () => ({ value: { revision: 1, text: "base" }, version: 1 }),
    save: async () => ({ kind: "saved" as const, version: 2, revision: 99 }),
  });
  await engine.start({ revision: 1, text: "base" });

  await assert.rejects(
    engine.acquire({ revision: 2, text: "next" }, 2),
    SyncProtocolError
  );
  engine.dispose();
});

test("a failed initial handshake never enables a project push", async () => {
  let saves = 0;
  const engine = createEngine({
    load: async () => {
      throw new Error("invalid auth");
    },
    save: async () => {
      saves += 1;
      return { kind: "saved" as const, version: 1 };
    },
  });

  await assert.rejects(engine.start({ revision: 1, text: "local" }), /invalid auth/);
  await assert.rejects(engine.acquire({ revision: 1, text: "local" }, 1), /invalid auth|首次握手/);
  assert.equal(saves, 0);
  engine.dispose();
});
