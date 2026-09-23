# Bolt project rules

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
- keep the docs clean, and facts only

#### Bolt Assistent
- drive it to places
- repeat experiments

#### Reading logs and traces
- keep raw data out of the conversation: session files, traces and frames cost context and are rarely needed whole
- known question: a script computes the answer where the data lives (evaluate_script over the session files in the page, python or node over sessions/*.zip) and returns only the result
- bulky output goes to a file (evaluate_script with filePath), a script reads it
- open question, not sure what to look for: delegate to a subagent, it reads the logs in its own context and returns the conclusion
- raw rows only when a summary cannot answer the question
