import { describeProfileRepositoryContract } from "@/testing/contracts/profileRepositoryContract";
import { createInMemoryProfileRepository } from "../inMemoryProfileRepository";

describeProfileRepositoryContract("in-memory", async (now) => createInMemoryProfileRepository(now));
