import { createLocalDataWiper } from "../LocalDataWiper";

const store = () => ({ clear: jest.fn(async () => {}) });

describe("local data wiper", () => {
  it("clears every store", async () => {
    const stores = [store(), store(), store()];
    await createLocalDataWiper(stores).wipe();
    stores.forEach((target) => expect(target.clear).toHaveBeenCalledTimes(1));
  });

  it("keeps clearing after a failure, then reports storage_failed", async () => {
    const failing = { clear: jest.fn(async () => Promise.reject(new Error("disk full"))) };
    const after = store();
    await expect(createLocalDataWiper([store(), failing, after]).wipe()).rejects.toMatchObject({
      name: "DomainError",
      code: "storage_failed",
    });
    expect(after.clear).toHaveBeenCalledTimes(1);
  });
});
