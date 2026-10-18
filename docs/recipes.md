# Recipes

Know-how of the seek as it stands. An entry lives until it is a function with a header in `packages/core/src`, then it goes; where the code exists already the entry says only what the piece is for and names the file. Terms are in `terms.png`.

## The ladder: `communication/communication.ts`

A frame is heard inside the lobe of its strength and lost abeam; a stronger frame has a wider lobe. One strength alone tells little: too strong and it is heard all round, too weak and it does not arrive. So the hider sends a ladder, the levels in turn, one frame every 200 ms, on all four emitters, round after round. The seeker then always has one level that is just arriving, the carrier, with an edge that tells direction, and the levels above it that say "the hider is there" even when the carrier is silent.

Two ladders, on channels of their own, so a frame names its ladder and its level:

| Ladder | Strengths | Channels | For |
|---|---|---|---|
| long | 2, 4, 8, 16 | 0 to 3 | the room; 16 reaches 4 m facing, 2 carries the last metre |
| short | 1, 2, 4 | 4 to 6 | the last stretch, where the long ladder's 2 is heard all round |

The strengths are chosen, not derived; the emitters go to 255.

## Negotiating the ladder: `referee/referee.ts`, `behavior/negotiate-ladder.ts`

The hider cannot hear and the seeker cannot tell the hider anything, so the referee switches the ladder. Every sweep starts with the seeker asking the referee for the ladder it wants; the referee tells the hider, the hider switches between rounds and shows it on its matrix, and the seeker waits for a frame on that ladder's channels before it listens in earnest. Without a frame in 4 s the sweep runs anyway and records that the ladder was not confirmed.

## The sweep: `behavior/sweep.ts`

The seeker's standing way to find a direction, in two steps. First the axis: it turns on the spot through 180° in 15° steps and listens one round at each heading. For every level heard at three or more headings and silent at two or more, the pattern of heard and silent headings is fitted with two lobes, 60° either side of an axis and its opposite; the axis that fits best, summed over those levels, is the line the hider is on. The notifies cannot say which end, since the rear lobe hears as well as the front one. Then the end: the seeker faces the axis, so the hider's frames arrive whichever end it is at, and reads its four corner receivers in volleys timed into the expected frames. A read that lands names the receivers that heard; the front pair puts the hider ahead, the back pair behind, opposite corners say nothing. Two reads on one side decide. The result is a direction, or nothing: no level fitted, or ten ladder rounds of reads on the axis without a decision. A sweep never guesses.

## The approach: `experiments/approach.ts`

From a direction to the hider's doorstep, by holding the hider at the edge of the carrier's lobe.

- **The leg.** The seeker drives with the hider 65° off its nose. Each round: the carrier heard means the hider slid into the lobe, turn 10° away; the carrier silent while a stronger level came means it slid out, turn 10° toward. A leg is 40 cm or ends when the carrier was silent two rounds in a row.
- **The tack.** At the leg's end a turn in place puts the hider on the other edge, 130° through it, and the next leg starts. The legs zigzag toward the hider; since every leg points only 17 cm of its 40 at the hider, full legs cannot close under about 47 cm.
- **The carrier.** The weakest level the last sweep fitted. When a weaker level is heard the carrier moves down to it; the weakest level heard at all would not do, since a strong level heard all round has no edge.
- **Lost.** A whole leg without the carrier while stronger levels came, or three rounds of nothing: stand and sweep again.
- **Near.** A frame of the long ladder's weakest level: the hider is close, the long ladder's lobes have no edge any more. Switch to the short ladder.
- **The dash band.** Short sweeps until one gives a direction with the short ladder's weakest level heard at all; that direction is handed over. A direction without it: drive 30 cm along it and sweep again. Nothing: back off 20 cm along the last direction and sweep again. Under about 40 cm no level has a lobe, so a short sweep taken there gives a direction out of noise; the rule does not notice a poor fit yet.

## The bump: not built

What is there: `experiments/seek-to-collision.ts` holds the tag rule, both Bolts' collision reports within 300 ms count as one contact, at the most sensitive collision threshold that stays quiet at rest. What the bump has to do: from the dash band's direction, drive straight at the hider until the contact, and tell a miss from a hit. A miss leaves the seeker past the hider with no level having an edge, so it has to back off along its line before it sweeps again.
