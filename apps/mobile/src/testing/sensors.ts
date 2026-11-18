// Stands in for expo-sensors, which is native: a test sends the phone's
// readings itself.

interface Reading {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const listeners = new Set<(reading: Reading) => void>();

export const Accelerometer = {
  setUpdateInterval: jest.fn(),
  addListener(listener: (reading: Reading) => void) {
    listeners.add(listener);
    return {
      remove() {
        listeners.delete(listener);
      },
    };
  },
};

/** How many screens listen to the phone's movement now. */
export const listening = () => listeners.size;

/** Shakes the phone: three hard swings at once. */
export function shake(): void {
  for (let swing = 0; swing < 3; swing += 1) {
    for (const listener of listeners) listener({ x: 2.5, y: 1, z: 0.5 });
  }
}
