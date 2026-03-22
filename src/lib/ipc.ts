declare global {
  interface Window {
    electronAPI: {
      invoke: (command: string, args?: unknown) => Promise<unknown>;
      on: (
        channel: string,
        callback: (...args: unknown[]) => void,
      ) => () => void;
    };
  }
}

export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return window.electronAPI.invoke(command, args) as Promise<T>;
}

export function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  const unlisten = window.electronAPI.on(event, (data: unknown) => {
    handler({ payload: data as T });
  });
  return Promise.resolve(unlisten);
}
