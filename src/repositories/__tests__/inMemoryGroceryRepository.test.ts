import { describeGroceryRepositoryContract } from "@/testing/contracts/groceryRepositoryContract";
import { createInMemoryGroceryRepository } from "../inMemoryGroceryRepository";

describeGroceryRepositoryContract("in-memory", async (now, limits) => createInMemoryGroceryRepository(now, limits));
