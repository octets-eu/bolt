# Hide and seek

What happens when two Bolts play hide and seek. This is the goal the code is built toward; where the code does something else, one of the two is wrong. The words are explained in `terms.png`.

## The players

A Bolt is a ball that rolls, with four infrared emitters and four infrared receivers at its corners. It cannot see. It can call out, and it can hear a call, but hearing only says "a message came", not from where.

- **The hider** stands still somewhere on the floor and calls out without pause. The call is the ladder: a message at strength 2, then 4, 8 and 16, one every 200 ms, on all four emitters, round after round.
- **The seeker** listens, finds out where the call comes from, drives there and bumps into the hider so that both feel it.
- **The referee** is a program on the computer, connected to both. It starts the game, tells the hider which ladder to send, hears both Bolts report the bump and calls the tag. It never tells the seeker where the hider is.

## What the seeker has

Hearing. The hider's message carries one number, its channel. It tells the seeker which ladder and which strength arrived, never where from. The seeker hears it while the hider is roughly ahead or roughly behind, inside a lobe about nose and tail, and loses it when the hider is off to the side; from the message alone, ahead or behind is a coin flip. The four receivers sit at the corners, 45° off the nose in front and 135° behind, each with a lobe of its own. Read while a frame is in the air, the corners that heard it name the hider's side. With the hider square to the side, at 90°, it sits 45° off both corners on that side, so front and back corner hear it alike, and ahead or behind is a coin flip again. Why the call is a ladder of strengths is in the ladder's comment, `packages/core/src/communication/communication.ts`.

The seeker knows nothing of the room: no map, no walls, no camera. From how loud the call arrives it holds a rough idea of how far away the hider is. Everything it does follows from what it hears right now and what it has heard on the way. That is why its path looks odd to an observer, with short legs and many turns. The path is implementation and the subject of the experiments: first a game has to work at all, then the path gets clever and elegant.

## A game

1. **Start.** Both Bolts stand on the floor, the hider somewhere, the seeker anywhere and pointing anywhere. The referee starts the ladder.
2. **The seek.** The seeker listens, turns, drives and listens again until the hider is in front of it.
3. **The tag.** The seeker drives into the hider. Both feel the bump and report it. When the referee hears both reports within a moment of each other, the game ends.

## Not in the game yet

The room. The seeker drives at one gentle speed whatever it believes; it could drive faster when it is sure of the direction and slow down when it is not. It can get wedged between two pieces of furniture, where the only way out is backwards. It can stall on a doorsill or a cable, where a moment of extra push gets it over. It can hit the leg of a table, which feels like a bump but is not the hider, and has to back off and go round. And it can get stuck for good, in a cushion or under a chair, with nothing left to do but call for help: blink, and rattle its motors back and forth at full torque, which is loud on a hard floor and can even make the ball hop. A Bolt has no speaker, but it is not mute.

For all of these the seeker needs a sense it does not have yet: that it is pushing but not moving, and that a bump came from something that did not bump back. The speed comes first, because it needs no new sense. The stuck sense comes next, because one sense covers the wedge, the sill and the cushion. Going round a leg comes last.

A hider that moves. A second game with the roles swapped.
