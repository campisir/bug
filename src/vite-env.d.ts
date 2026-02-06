/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  // Add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electron?: {
    ipcRenderer: {
      send: (channel: string, data: any) => void;
      on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  };
}
