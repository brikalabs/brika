let ready = false;

export const isHubReady = () => ready;
export const setHubReady = () => {
  ready = true;
};
export const setHubStopping = () => {
  ready = false;
};
