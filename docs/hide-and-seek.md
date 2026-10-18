# Hide and seek

What happens when two Bolts play hide and seek. This is the goal the code is built toward; where the code does something else, one of the two is wrong. The words are explained in `terms.png`.

## The players

A Bolt is a ball that rolls, with four infrared emitters and four infrared receivers at its corners. It cannot see. It can call out, and it can hear a call, but hearing only says "a message came", not from where.

- **The hider** stands still somewhere on the floor and calls out without pause. The call is the ladder: a message at strength 2, then 4, 8 and 16, one every 200 ms, on all four emitters, round after round.
- **The seeker** listens, finds out where the call comes from, drives there and bumps into the hider so that both feel it.
- **The referee** is a program on the computer, connected to both. It starts the game, tells the hider which ladder to send, hears both Bolts report the bump and calls the tag. It never tells the seeker where the hider is.

## What the seeker has

Hearing. A message is heard when the hider is roughly ahead or roughly behind, and lost when it is off to the side; how the seeker turns that into a direction and a path is in `recipes.md`.

The seeker knows nothing of the room: no map, no walls, no camera, no idea how far away the hider is. Everything it does follows from what it hears right now. That is why its path looks odd to an observer, with short legs and many turns. The path is implementation and the subject of the experiments: first a game has to work at all, then the path gets clever and elegant.

## A game

1. **Start.** Both Bolts stand on the floor, the hider somewhere, the seeker anywhere and pointing anywhere. The referee starts the ladder.
2. **The seek.** The seeker listens, turns, drives and listens again until the hider is in front of it.
3. **The tag.** The seeker drives into the hider. Both feel the bump and report it. When the referee hears both reports within a moment of each other, the game ends.

## Not in the game yet

The tag. Walls, furniture and the edge of the floor. A hider that moves. A second game with the roles swapped.
