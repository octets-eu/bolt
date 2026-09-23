/** GATT identifiers of the Sphero BOLT. */

export const SPHERO_SERVICE            = '00010001-574f-4f20-5370-6865726f2121';
export const APIV2_CHARACTERISTIC      = '00010002-574f-4f20-5370-6865726f2121';

export const SPHERO_INITIALIZE_SERVICE = '00020001-574f-4f20-5370-6865726f2121';
export const ANTIDOS_CHARACTERISTIC    = '00020005-574f-4f20-5370-6865726f2121';

/** "usetheforce...band": the firmware refuses commands until this arrives on the anti-DoS characteristic. */
export const ANTIDOS_KEY = new TextEncoder().encode('usetheforce...band');
