import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { describeRemoteIngredientSourceContract } from "@/testing/contracts/remoteIngredientSourceContract";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { createInMemoryRemoteIngredientSource } from "../inMemoryRemoteIngredientSource";
import { SAMPLE_INGREDIENTS } from "../sampleIngredients";

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";

function setup({ online = true, signedIn = true } = {}) {
  const server = createInMemoryServer({ connectivity: createFakeConnectivity(online).service });
  server.signedInUid = signedIn ? UID : null;
  return { server, source: createInMemoryRemoteIngredientSource(server) };
}

describeRemoteIngredientSourceContract("in-memory", {
  seeded: SAMPLE_INGREDIENTS,
  signedIn: async ({ online = true } = {}) => setup({ online }).source,
  signedOut: async () => setup({ signedIn: false }).source,
});

describe("in-memory ingredient source", () => {
  it("serves the sample ingredients by default", async () => {
    const { source } = setup();
    const page = await source.listPage(500);
    expect(page.docs.map((document) => document.id)).toEqual(SAMPLE_INGREDIENTS.map((ingredient) => ingredient.id).sort());
  });

  it("serves the ingredients a test passes, as copies", async () => {
    const server = createInMemoryServer({ connectivity: createFakeConnectivity().service });
    server.signedInUid = UID;
    const salt = makeIngredient("salt", "Salt");
    const source = createInMemoryRemoteIngredientSource(server, [salt]);
    const first = await source.listPage(10);
    (first.docs[0].data as { name: string }).name = "Changed";
    expect((await source.listPage(10)).docs).toEqual([{ id: "salt", data: expect.objectContaining({ name: "Salt" }) }]);
  });

  it("can be made to fail a chosen page, and obeys the dev offline switch", async () => {
    const { server, source } = setup();
    server.controls.failNext("ingredients.list", "unknown");
    await expect(source.listPage(10)).rejects.toMatchObject({ code: "unknown" });
    server.controls.setOffline(true);
    await expect(source.listPage(10)).rejects.toMatchObject({ code: "offline" });
  });
});
