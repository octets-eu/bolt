---
title: rollToPoint, the first version
kind: reference
created: 2026-09-22
source: commit 89903ae, 2026-09-16, apps/browser/src/devices/bolt/actuators.ts and services/math.ts
---

# rollToPoint, the first version

Verbatim from the first commit of this workspace, the driver as copied from
Bolt-Browser. Re-aims on every sensor packet with one drive packet, a speed
ladder by distance, stops within the tolerance, and ends on fullstop.
`roll` and `stop` were one packet each, `stop` a roll at speed zero on the
current heading. Stabilization was not touched here; the caller had it on.

```ts
  async rollToPoint (target: IPoint, tolerance=5) {

    console.log(this.bolt.name, 'rollToPoint.in :', this.bolt.status.position, '=>', target);

    return new Promise( async (resolve, reject) => {

      const fullStopListener = async () => {
        await this.bolt.receiver.off('fullstop',   fullStopListener);
        await this.bolt.receiver.off('sensordata', sensorListener);
        resolve('fullstop');
      };

      const sensorListener = async (event: IEvent) => {

        let speed: number, distance: number, heading: number;

        const location = {
          x: event.sensordata.locator.positionX,
          y: event.sensordata.locator.positionY,
        } as IPoint;
        distance = M.distance(target, location);  // Math.hypot(target.x - x, target.y - y);
        heading  = M.heading(location, target);   // Math.atan2(y - target.y, x - target.x) * -180 / Math.PI +270;
        heading  = M.mod(heading);                //(heading + 360) % 360;

        speed = (
          distance > 100 ? 100 :
          distance >  50 ?  50 :
          distance >  30 ?  30 :
          distance >  20 ?  20 :
          15
        );

        console.log(this.bolt.name, 'rollToPoint', 'speed', speed, 'distance', distance);

        if (distance > tolerance) {
          await this.roll(speed, heading);

        } else {
          console.log('rollToPoint.out:', this.bolt.status.position, '=>', target);
          await this.stop();
          await this.bolt.receiver.off('sensordata', sensorListener);
          await this.bolt.receiver.off('fullstop',   fullStopListener);
          resolve(distance);
          // console.log('rollToPoint.tck:', this.bolt.status.position, '=>', target, 'd', ~~distance, 'h', ~~heading);

        }

      };

      await this.bolt.receiver.on('sensordata', sensorListener);
      await this.bolt.receiver.on('fullstop',   fullStopListener);

    });

  }
```

The two packets it sent:

```ts
  async stop() {
    // await this.disableSensors();
    return await this.roll(0, this.bolt.status.heading);
  }

  async roll(speed: number, heading: number, flags: TNum = []) {
    this.bolt.heading = heading;
    return await this
      .queue('roll', { data: [speed, (this.bolt.heading >> 8) & 0xff, this.bolt.heading & 0xff, flags] })
    ;
  }
```

The helpers, from services/math.ts:

```ts
  distance(a: IPoint, b: IPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },

  // angle to drive from a to b, 0 is north
  heading (a: IPoint, b: IPoint) {
    // Math.atan2(y - target.y, x - target.x) * -180 / Math.PI +270;
    return Math.atan2(a.y - b.y, a.x - b.x) * -180 / Math.PI +270;
  },

  mod (a: number) {
    return a % 360;
  },
```
