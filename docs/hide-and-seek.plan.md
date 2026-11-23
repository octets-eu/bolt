# Top level plan for hide&seek with bolts

**This file maintained by user, only edit with confirmation**

## Sub Goals

- make seeker find sender with end collision, simple (**current goal**)
  - goal: 30secs drive time per meter, tested 0.5m to 3.5m

- make seeker find sender with end collision, can handle surface bumps with more torque
  - goals: 
    - 30secs per meter, tested 0.5m to 3.5m
    - can drive over mat

- make seeker find sender with end collision, can handle furniture legs by driving around
  - goals: 
    - 30secs per meter, tested 0.5m to 3.5m
    - can drive over mat
    - can drive around obstacles


- make seeker find sender with end collision, can handle only one way out
  - goals: 
    - 30secs per meter, tested 0.5m to 3.5m
    - can drive over mat
    - can drive around obstacles
    - can handle stuck behind chest or similar


## Backlog

- 01, build proper brain from : (**current task, parked**)
    - Observation layer (code)
    - circuit.json to connectome 
    - Motor (code)

- 02, revisit docs/brain-view.plan.md
    - generate vis from circuit.json

- 03, continue work on apps/play/rooms.md
    - turn into full arch/req docs, demo iPadOs

- 04, choose a ladder for the room and build the brain from it (**current subtask**)
    - bands, weights and limits follow the ladder

- 05, Green bolt did not register 2 collisions, paired with blue.
    - run a test a suite with gentle collisions to verify window and threshold, all bolts

**more tasks and goals will be defined**




