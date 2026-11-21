// The shared ingredient data in Firestore (ingredients/{id}) when EXPO_PUBLIC_BACKEND is
// "firebase". Read-only: the Security Rules let a signed-in user read and nobody write.
// Reads come from the server only (the cache would answer "nothing there" when offline),
// and every call goes through firestoreCall, so it gives up offline or after the time limit.
import { domainError } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter } from "firebase/firestore";
import { ingredientPageArgsSchema, type RemoteIngredientPage, type RemoteIngredientSource } from "./RemoteIngredientSource";

type FirebaseRemoteIngredientSourceDependencies = FirestoreCallOptions & {
  client: Pick<FirebaseClient, "auth" | "db">;
};

export function createFirebaseRemoteIngredientSource({
  client,
  ...callOptions
}: FirebaseRemoteIngredientSourceDependencies): RemoteIngredientSource {
  const { auth, db } = client;

  return {
    async listPage(pageSize, after): Promise<RemoteIngredientPage> {
      const args = ingredientPageArgsSchema.safeParse({ limit: pageSize, after });
      if (!args.success) throw domainError("invalid_input");
      // The Rules refuse signed-out reads; don't make a call that can only fail.
      if (auth.currentUser === null) throw domainError("not_owner");

      // Ordered by the document ID only, so no composite index is needed. The collection
      // name is a constant and the cursor is a checked ID.
      const constraints = [
        orderBy(documentId()),
        ...(args.data.after === undefined ? [] : [startAfter(args.data.after)]),
        limit(args.data.limit),
      ];
      try {
        const snapshot = await firestoreCall(callOptions, () =>
          getDocsFromServer(query(collection(db, "ingredients"), ...constraints)),
        );
        const docs = snapshot.docs.map((document) => ({ id: document.id, data: document.data() as unknown }));
        const last = docs.at(-1);
        return last !== undefined && docs.length === args.data.limit ? { docs, next: last.id } : { docs };
      } catch (error) {
        // A refusal by the Rules means "not signed in" here. Firebase codes stop here.
        throw firestoreError(error, "not_owner");
      }
    },
  };
}
