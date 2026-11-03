# Questions

The agent's questions to the human and the answers, newest last. A question is a section, `## <date> <subject>` and the text; the agent appends it, sleeps the Bolts and ends the session. The answer is a line starting `Answer:` under the question; the human writes it and starts the next session, which reads this file first. The start script does not start while the last section has no answer.
