# A room from photos

An alternative to the roaming step of the app: instead of the Bolts bumping their way round a new room, somebody takes photos and a model turns them into walls and furniture. Nothing here is tried yet; this is what exists, what it would cost on RunPod and how it would be set up.

## The two steps

Photos become a room in two steps, each with an open model.

| Step | Model | Takes | Gives |
|---|---|---|---|
| 1. Photos to 3D | VGGT (Meta) | a set of plain photos, no calibration, no known camera positions | camera position per photo, depth maps and a 3D point cloud, in one pass |
| 2. 3D to a room | SpatialLM (Manycore) | a point cloud as a PLY file, axis-aligned, z up | walls, doors, windows and furniture as labelled, oriented boxes, in a text file |

- VGGT's predecessors DUSt3R and MASt3R work on two images at a time and need extra alignment for more.
- SpatialLM's own README takes its point clouds from video through MASt3R-SLAM and names SLAM3R as another source; that is its documented route. VGGT is the route for single photos.
- SpatialLM knows 59 furniture categories and can be asked for a subset.
- On an iPhone or iPad with LiDAR, Apple's RoomPlan does both steps on the device and returns metres. It needs no server, but the app is a web app on Android, where it does not exist.

## What the Bolts need that photos do not give

- **Size.** Plain photos give the room's shape, not its size. Something of known length has to be in the pictures; a Bolt is 7.3 cm across.
- **Floor level.** The models see the room at eye height. A Bolt meets it at 4 cm: chair legs, cables, the gap under a chest. A photo room shows furniture as boxes, not what is open underneath.
- **Which way is up.** VGGT's cloud lies in the first camera's frame; SpatialLM wants z up.

So a photo room is a start, not the final map: the Bolts' bump points still correct it at floor level.

## What has to be written

Neither repository does these, by their READMEs:

1. VGGT's point map written out as a PLY file. The repository shows the cloud in a viewer and exports COLMAP files, not a PLY.
2. The cloud turned so that z is up and the walls lie along the axes.
3. The cloud scaled to metres, from a Bolt in the pictures or one wall measured by hand.
4. SpatialLM's text output turned into the app's room: a floor plan in centimetres with walls and furniture outlines.

## Requirements, from the READMEs

| | VGGT | SpatialLM |
|---|---|---|
| Checkpoints | `VGGT-1B`, `VGGT-1B-Commercial` | `SpatialLM1.1-Qwen-0.5B`, `SpatialLM1.1-Llama-1B`, and the 1.0 pair |
| Software | torch, torchvision, numpy, Pillow, huggingface_hub; no versions stated | tested on Python 3.11, PyTorch 2.4.1, CUDA 12.4; Sonata encoder for 1.1, sparsehash |
| GPU memory | not stated | not stated |
| Speed | "typically reconstructs a scene in less than 1 second" | not stated |
| Run | `demo_colmap.py --scene_dir=<dir>` with the photos in `<dir>/images/` | `python inference.py --point_cloud room.ply --output room.txt --model_path manycore-research/SpatialLM1.1-Qwen-0.5B` |

- **VGGT's memory:** an earlier version of its README listed about 11 GB for 50 photos and 21 GB for 100; that is from memory and not verified, and the README now says a later update fits two to three times more photos into the same memory. A 24 GB card is the size assumed below.
- **Licences:** `VGGT-1B` is non-commercial; the commercial checkpoint is given on application. SpatialLM 1.1 uses the Sonata encoder, whose weights are CC-BY-NC. Fine for this project, not for an app that is sold.

## Cost on RunPod

Prices and stock are from RunPod's catalog as read on 2026-11-06, secure cloud, pods. Every 24 GB card with stock at that moment:

| GPU | Memory | Pod, per hour | Serverless, per hour | Stock, data centers |
|---|---|---|---|---|
| RTX PRO 4000 Blackwell | 24 GB | $0.57 | not offered | low: EU-RO-1 |
| L4 | 24 GB | $0.59 | $0.75 | low: EUR-IS-1, US-MO-2 |
| PRO 6000 MIG 24GB | 24 GB | $0.69 | $0.75 | low: EUR-IS-2, US-PA-1, US-WA-1 |
| RTX 4090 | 24 GB | $0.89 | $1.34 | low: EU-RO-1, EUR-IS-2 |
| A40, for headroom | 48 GB | $0.59 | $1.22 | low: CA-MTL-1, EU-SE-1 |

Cheaper 24 GB cards exist in the catalog without stock at that moment: RTX A5000 at $0.27 and RTX 3090 at $0.50.

The estimates below multiply those prices by assumed times. The times are assumptions, since neither README states them for a whole room.

| What | Assumption | Estimate |
|---|---|---|
| Trying it out | one pod with a 24 GB card for 4 hours of setting up and experiments | $2.30 to $3.60 |
| One room, serverless, cold | 5 minutes of worker time: start, load both models, run, at $0.75 an hour | about 6 cents |
| One room, serverless, warm | 1 minute of worker time at $0.75 an hour | about 1 cent |
| A pod left on for a month | 24 hours a day at $0.57 an hour | about $410 |

- Storage for the models, a few GB of container or volume disk, is not in these figures; its price was not read.
- A room is scanned once and then kept, so almost every job is a cold start, and a pod kept running makes no sense. Serverless with no warm worker costs nothing while idle.

## Rough setup

**To try it, on a pod:**

1. Rent one 24 GB card as a pod with a PyTorch image.
2. Clone both repositories and install them as their READMEs say; download `VGGT-1B` and `SpatialLM1.1-Qwen-0.5B`.
3. Take 30 to 60 photos of the room, with a Bolt on the floor in several of them, and copy them to the pod.
4. Run VGGT on the photos, then the four pieces of glue above, then SpatialLM.
5. Compare the result with the floor plan in `apps/browser/public/floor-plan.svg`, which is measured by hand.
6. Stop the pod.

**For the app, serverless:**

1. One worker image holding both models and a handler: photos in, the room as JSON out.
2. An endpoint on the 24 GB pool with no warm worker.
3. A small server of our own between the app and RunPod, which holds the API key; the key never goes into the app.
4. The app uploads the photos, shows a waiting screen for the minutes a cold start takes, and receives the room.

**To check before building:**

- Whether the hosts' CUDA version suits the images; the stock read showed CUDA 13.2 on most hosts, and SpatialLM is tested on 12.4.
- How much memory and time a real room takes; the first pod run gives both numbers.
- Whether SpatialLM accepts a VGGT cloud at all; its README shows clouds from MASt3R-SLAM, RGBD and LiDAR.

## Sources

- [VGGT repository](https://github.com/facebookresearch/vggt)
- [VGGT paper](https://arxiv.org/html/2503.11651v1)
- [SpatialLM repository](https://github.com/manycore-research/SpatialLM)
- [SpatialLM paper](https://arxiv.org/html/2506.07491v2)
- [Review of feed-forward 3D reconstruction, DUSt3R to VGGT](https://aitopics.org/doc/arxivorg:86D921B1)
