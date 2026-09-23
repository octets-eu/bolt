# Bolt

## Run

```
npm install
npm run dev
```

opens the app on `https://localhost:8080`. Pairing, certificates and the
Chrome flags are in `research/setup.md`, the local research notes, which are not in the public repository.

## Layout

| Path | What |
|---|---|
| `packages/core` | the driver, pure TypeScript in four layers, see its README |
| `packages/web-ble` | Web Bluetooth transport |
| `packages/protocol` | the session file format |
| `apps/browser` | the one page: command buttons, status, camera tracker, plotter, logger, session log |
| `apps/browser/public/beacon.html` | the lighthouse page for the phone |
| `docs` | below |


## References

- [Sphero Public SDK](https://sdk.sphero.com/documentation/)
- [spherov2.py](https://github.com/artificial-intelligence-class/spherov2.py), the command tables
- [Web Bluetooth implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)
- [Bluetooth GATT services and characteristics](https://www.novelbits.io/bluetooth-gatt-services-characteristics/)
