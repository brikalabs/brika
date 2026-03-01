export type Json =
  | null
  | boolean
  | number
  | string
  | undefined
  | Json[]
  | {
      [k: string]: Json;
    };
