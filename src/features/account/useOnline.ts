import { useConnectivity } from "@/services/ServiceProvider";
import { useEffect, useState } from "react";

// true or false once known, null while the first check is still running.
export function useOnline(): boolean | null {
  const connectivity = useConnectivity();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const update = (value: boolean) => {
      if (active) setOnline(value);
    };
    connectivity.isOnline().then(update);
    const unsubscribe = connectivity.subscribe(update);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [connectivity]);

  return online;
}
