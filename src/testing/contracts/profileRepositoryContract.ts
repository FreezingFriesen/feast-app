// Shared behaviour for every ProfileRepository (in-memory and SQLite).
import type { Profile, ProfileRepository, ProfileWriteResult } from "@/repositories/ProfileRepository";

export const CONTRACT_UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
export const T0 = Date.UTC(2026, 9, 1);

export const INCOMING_PROFILE = {
  username: "levi_f",
  dietaryRestrictions: null,
  createdAt: T0,
  updatedAt: T0,
  schemaVersion: 1,
};

function expectOk(result: ProfileWriteResult): Profile {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.profile;
}

export function describeProfileRepositoryContract(
  name: string,
  create: (now: () => number) => Promise<ProfileRepository>,
) {
  const UID = CONTRACT_UID;
  const incoming = INCOMING_PROFILE;

  // A clock the test controls, so updatedAt values are predictable.
  async function setup() {
    let time = T0 + 1_000;
    const repo = await create(() => time);
    return {
      repo,
      setTime: (value: number) => {
        time = value;
      },
    };
  }

  async function setupWithProfile() {
    const context = await setup();
    expect(await context.repo.mergeIncoming(UID, incoming)).toBe("applied");
    return context;
  }

  describe(`ProfileRepository contract: ${name}`, () => {
    describe("mergeIncoming", () => {
      it("stores a valid profile under the uid", async () => {
        const { repo } = await setupWithProfile();
        expect(await repo.get(UID)).toEqual({ ...incoming, uid: UID });
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        await repo.mergeIncoming(UID, { ...incoming, uid: "someone-else", isAdmin: true });
        const profile = await repo.get(UID);
        expect(profile).not.toHaveProperty("isAdmin");
        expect(profile?.uid).toBe(UID);
      });

      it("last edit wins: newer replaces, older and equal keep the local copy", async () => {
        const { repo } = await setupWithProfile();
        const restricted = { allergens: ["milk"], diets: [] };

        expect(
          await repo.mergeIncoming(UID, { ...incoming, dietaryRestrictions: restricted, updatedAt: T0 + 10 }),
        ).toBe("applied");
        expect(await repo.mergeIncoming(UID, { ...incoming, updatedAt: T0 + 5 })).toBe("kept_local");
        expect(await repo.mergeIncoming(UID, { ...incoming, updatedAt: T0 + 10 })).toBe("kept_local");
        expect((await repo.get(UID))?.dietaryRestrictions).toEqual(restricted);
      });

      it.each([
        { username: "'; DROP TABLE recipes;--" },
        { username: "<script>alert(1)</script>" },
        { username: "Levi" },
        { dietaryRestrictions: { allergens: ["<script>"], diets: [] } },
        { updatedAt: "tomorrow" },
        { schemaVersion: 99 },
      ])("rejects invalid incoming data %p and stores nothing", async (patch) => {
        const { repo } = await setup();
        expect(await repo.mergeIncoming(UID, { ...incoming, ...patch })).toBe("invalid");
        expect(await repo.get(UID)).toBeUndefined();
      });

      it.each(["", "../x", "a/b", "abc def", "a".repeat(129), "'; DROP TABLE profiles;--"])(
        "rejects unsafe uid %p",
        async (uid) => {
          const { repo } = await setup();
          expect(await repo.mergeIncoming(uid, incoming)).toBe("invalid");
          expect(await repo.get(uid)).toBeUndefined();
        },
      );
    });

    describe("setDietaryRestrictions", () => {
      it("validates, stores the parsed restrictions and bumps updatedAt", async () => {
        const { repo, setTime } = await setupWithProfile();
        setTime(T0 + 5_000);
        const profile = expectOk(
          await repo.setDietaryRestrictions(UID, { allergens: ["milk", "peanuts", "milk"], diets: ["vegan"] }),
        );
        expect(profile.dietaryRestrictions).toEqual({ allergens: ["peanuts", "milk"], diets: ["vegan"] });
        expect(profile.updatedAt).toBe(T0 + 5_000);
        expect(profile.createdAt).toBe(T0);
        expect(await repo.get(UID)).toEqual(profile);
      });

      it("stores an explicit 'none' differently from 'not set yet'", async () => {
        const { repo } = await setupWithProfile();
        expect((await repo.get(UID))?.dietaryRestrictions).toBeNull();
        const profile = expectOk(await repo.setDietaryRestrictions(UID, { allergens: [], diets: [] }));
        expect(profile.dietaryRestrictions).toEqual({ allergens: [], diets: [] });
        expect((await repo.get(UID))?.dietaryRestrictions).toEqual({ allergens: [], diets: [] });
      });

      it("never moves updatedAt backwards when the clock goes back", async () => {
        const { repo, setTime } = await setupWithProfile();
        setTime(T0 - 60_000);
        const profile = expectOk(await repo.setDietaryRestrictions(UID, { allergens: ["fish"], diets: [] }));
        expect(profile.updatedAt).toBe(T0 + 1);
        // So an older download can't undo the edit
        expect(await repo.mergeIncoming(UID, { ...incoming, updatedAt: T0 })).toBe("kept_local");
      });

      it.each([
        { allergens: ["'; DROP TABLE recipes;--"], diets: [] },
        { allergens: ["<script>alert(1)</script>"], diets: [] },
        { allergens: ["Milk"], diets: [] },
        { allergens: [], diets: ["a".repeat(10_000)] },
        null,
        "milk",
      ])("rejects %p and leaves the profile unchanged", async (input) => {
        const { repo } = await setupWithProfile();
        const before = await repo.get(UID);
        expect(await repo.setDietaryRestrictions(UID, input)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.get(UID)).toEqual(before);
      });

      it("returns not_found without a profile or for an unsafe uid", async () => {
        const { repo } = await setupWithProfile();
        const input = { allergens: [], diets: [] };
        expect(await repo.setDietaryRestrictions("SomeoneElse123", input)).toEqual({ ok: false, reason: "not_found" });
        expect(await repo.setDietaryRestrictions("../x", input)).toEqual({ ok: false, reason: "not_found" });
      });
    });

    it("notifies after every change until unsubscribed, and clear removes everything", async () => {
      const { repo } = await setup();
      const listener = jest.fn();
      const unsubscribe = repo.subscribe(listener);

      await repo.mergeIncoming(UID, incoming);
      await repo.setDietaryRestrictions(UID, { allergens: ["soy"], diets: [] });
      expect(listener).toHaveBeenCalledTimes(2);

      // Rejected writes and kept-local merges do not notify.
      await repo.setDietaryRestrictions(UID, { allergens: ["nope"], diets: [] });
      await repo.mergeIncoming(UID, incoming);
      expect(listener).toHaveBeenCalledTimes(2);

      await repo.clear();
      expect(listener).toHaveBeenCalledTimes(3);
      expect(await repo.get(UID)).toBeUndefined();

      unsubscribe();
      await repo.mergeIncoming(UID, incoming);
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });
}
