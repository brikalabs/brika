export { actionBlock } from "./action";
export { conditionBlock } from "./condition";
export { switchBlock } from "./switch";
export { delayBlock } from "./delay";
export { emitBlock } from "./emit";
export { setBlock } from "./set";
export { logBlock } from "./log";
export { endBlock } from "./end";

import { actionBlock } from "./action";
import { conditionBlock } from "./condition";
import { switchBlock } from "./switch";
import { delayBlock } from "./delay";
import { emitBlock } from "./emit";
import { setBlock } from "./set";
import { logBlock } from "./log";
import { endBlock } from "./end";

/** All built-in blocks */
export const builtinBlocks = [
  actionBlock,
  conditionBlock,
  switchBlock,
  delayBlock,
  emitBlock,
  setBlock,
  logBlock,
  endBlock,
];

