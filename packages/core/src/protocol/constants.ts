/**
 * Sphero API v2 identifiers as the BOLT firmware uses them. Sources: the
 * official RVR SDK where published, spherov2.py and pysphero otherwise, plus
 * the community forum for the awake notification. Everything here has been
 * seen working on a BOLT unless a comment says otherwise.
 */

export const DeviceId = {
  apiProcessor: 0x10,
  systemInfo:   0x11,
  power:        0x13,
  driving:      0x16,
  animatronics: 0x17,
  sensor:       0x18,
  bluetooth:    0x19,
  userIO:       0x1a,
} as const;
export type DeviceId = (typeof DeviceId)[keyof typeof DeviceId];

/** The two processors a command can be addressed to. */
export const Target = {
  /** Nordic: Bluetooth and power. */
  nordic: 0x11,
  /** ST: motion control, sensors, matrix. */
  st:     0x12,
} as const;
export type Target = (typeof Target)[keyof typeof Target];

export const ApiCommand = {
  ping: 0x00,
} as const;

export const PowerCommand = {
  deepSleep:                        0x00,
  sleep:                            0x01,
  getBatteryVoltage:                0x03,
  wake:                             0x0d,
  getBatteryVoltageState:           0x17,
  enableBatteryVoltageStateNotify:  0x1b,
  getChargerState:                  0x1f,
  enableChargerStateNotify:         0x20,
} as const;

export const PowerNotify = {
  /** System awake: sent ~10 ms after wake, the robot is ready for operations that need it awake. */
  awake:                0x11,
  willSleep:            0x19,
  didSleep:             0x1a,
  batteryVoltageState:  0x1c,
  chargerState:         0x21,
} as const;

export const DrivingCommand = {
  rawMotor:          0x01,
  resetYaw:          0x06,
  driveWithHeading:  0x07,
  stabilization:     0x0c,
} as const;

export const SensorCommand = {
  setStreamingMask:          0x00,
  setStreamingMaskExtended:  0x0c,
  enableGyroMaxNotify:       0x0f,
  configureCollision:        0x11,
  resetLocator:              0x13,
  getInfraredReadings:       0x22,
  calibrateToNorth:          0x25,
  sendInfraredMessage:       0x2a,
  listenInfraredMessages:    0x2b,
  getAmbientLight:           0x30,
} as const;

export const SensorNotify = {
  streamingData:    0x02,
  gyroMax:          0x10,
  collision:        0x12,
  compassNorthYaw:  0x26,
  infraredMessage:  0x2c,
} as const;

export const IOCommand = {
  setAllLeds:         0x1c,
  setMatrixPixel:     0x2d,
  setMatrixColor:     0x2f,
  clearMatrix:        0x38,
  setMatrixRotation:  0x3a,
  scrollMatrixText:   0x3b,
  drawMatrixLine:     0x3d,
  fillMatrix:         0x3e,
  setMatrixChar:      0x42,
} as const;

export const IONotify = {
  scrollTextDone:     0x3c,
  animationComplete:  0x3f,
} as const;

/** Bit 0..5 of the flags byte. */
export const Flag = {
  isResponse:                 1 << 0,
  requestsResponse:           1 << 1,
  requestsOnlyErrorResponse:  1 << 2,
  resetsInactivityTimeout:    1 << 3,
  hasTargetId:                1 << 4,
  hasSourceId:                1 << 5,
} as const;

/** Framing bytes; anything equal to one of the first three inside a packet is escaped. */
export const Byte = {
  start:          0x8d,
  end:            0xd8,
  escape:         0xab,
  escapedStart:   0x05,
  escapedEscape:  0x23,
  escapedEnd:     0x50,
  escapeMask:     0x88,
} as const;

/** Sequence number the firmware uses on notifications. */
export const NOTIFICATION_SEQ = 0xff;

export const ErrorCode = {
  success:              0,
  badDeviceId:          1,
  badCommandId:         2,
  notYetImplemented:    3,
  commandIsRestricted:  4,
  badDataLength:        5,
  commandFailed:        6,
  badParameterValue:    7,
  busy:                 8,
  badTargetId:          9,
  targetUnavailable:   10,
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export function errorName (code: number): string {
  for (const [name, value] of Object.entries(ErrorCode)) if (value === code) return name;
  return `unknown(${code})`;
}

export const StabilizationIndex = {
  none:         0x00,
  full:         0x01,
  pitch:        0x02,
  roll:         0x03,
  yaw:          0x04,
  speedAndYaw:  0x05,
} as const;
export type StabilizationIndex = (typeof StabilizationIndex)[keyof typeof StabilizationIndex];

export const FrameRotation = {
  deg0:   0x00,
  deg90:  0x01,
  deg180: 0x02,
  deg270: 0x03,
} as const;
export type FrameRotation = (typeof FrameRotation)[keyof typeof FrameRotation];

export const RawMotorMode = { off: 0, forward: 1, reverse: 2, brake: 3, ignore: 4 } as const;
export type RawMotorMode = (typeof RawMotorMode)[keyof typeof RawMotorMode];

export const BatteryState = { unknown: 0, ok: 1, low: 2, critical: 3 } as const;
export type BatteryState = (typeof BatteryState)[keyof typeof BatteryState];

export const ChargerState = { unknown: 0, notCharging: 1, charging: 2, charged: 3 } as const;
export type ChargerState = (typeof ChargerState)[keyof typeof ChargerState];

/**
 * Streaming mask bits. The first mask (setStreamingMask) carries locator,
 * accelerometer and orientation; the gyro sits in the extended mask.
 * Samples arrive in group order: orientation, accelerometer, locator, gyro.
 */
export const StreamGroup = {
  orientation:   (1 << 16) | (1 << 17) | (1 << 18),  // yaw, roll, pitch
  accelerometer: (1 << 13) | (1 << 14) | (1 << 15),  // z, y, x
  locator:       (1 << 3)  | (1 << 4)  | (1 << 5) | (1 << 6),  // vy, vx, y, x
  gyro:          (1 << 23) | (1 << 24) | (1 << 25),  // z, y, x, extended mask
} as const;
export type StreamGroupName = keyof typeof StreamGroup;
