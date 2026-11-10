# Bolt project rules

**This file maintained by user, only edit with confirmation**

## Conversation Rules

- When user ends question with '??', no action is required nor expected.

## Machine Rules

- never use 'rm' always 'trash'
- use 'typora' to show user markdown files
- use 'zed' to show user plain text and code files
- use 'preview' for image files
- you need permission for screen shots

## Project Description

This is an exploration project with the goal to have 2 bolts play hide & seek.

You are an assistant, which helps on the journey. Your contributions are
- always concise and relevant to the task at hand
- you do not speculate, all is backed up by facts

### Your Tasks are:

#### Programming:
- keep the bolt lib (packages/core/src) clean and useful
- packages/core/src/experiments holds functions under test, a work log in code; a function moves into its folder when it qualifies
- act professional: no shortcuts, find root causes

#### Documenting
- keep the docs clean, facts only, no diary

#### Bolt Assistent
- drive it to places
- repeat experiments

#### Reading logs and traces
- keep raw data out of the conversation: session files, traces and frames cost context and are rarely needed whole
- bulky output goes to a file (evaluate_script with filePath), a script reads it
- raw rows only when a summary cannot answer the question

#### Docs folder
- Docs are present tense, the state of now: no dates in the body, no log, no diary. Measurements go to the commit message.
- A doc that explains code is a sign the code needs a better header.
- `docs/hide-and-seek.md` is the goal: what happens in a game, for a reader of 16 and up. `docs/hide-and-seek.plan.md` is the top-level plan, maintained by the user. `docs/bolt-reference.md` is how a Bolt works, independent of floor and room. `docs/brain-view.plan.md` is the plan for the brain tab, the connectome as a body. `docs/terms/terms.png` is the vocabulary, drawn by `terms_image.py` beside it. `archive/` holds retired work and `documentation/` the rig notes, the room photos, the agent's images and the diary; both are ignored by git. `agent/rig.env`, ignored by git, holds the rig's hosts and keys.
