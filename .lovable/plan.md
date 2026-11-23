# Still Ballin voice coaching and homework

## What will change
- Keep the welcome page at `/` and the coach at `/coach`.
- Add a 1-, 2-, 3-, or 4-hour session choice and clear start/end states.
- During live camera sessions, give concise spoken coaching when useful feedback changes. Cache generated audio per cue and prevent repeating a cue within four seconds. Keep photo/video feedback available.
- Add spoken conversation: the player can talk, Still Ballin answers in a natural coaching voice, and the response remains readable on screen.
- At session end, assign a football- or tennis-specific drill. Let the player submit a video, review that video before the next session, then allow the next session to start.
- Keep session history and homework video files in this browser, as selected; no player account is added.
- Add a secure server endpoint that returns Fish Audio MP3 using the requested voice model. Request the API key through the secure credential form after the endpoint is ready.

## Technical approach
- Use a TanStack server route for raw MP3 responses; this project does not create Supabase Edge Functions.
- Use browser speech recognition for player voice input and the existing coaching service for spoken replies.
- Keep session details in browser storage and video blobs in IndexedDB, with local-only data and no cloud video uploads.
- Validate the endpoint input, keep credentials server-only, and add UI fallbacks when microphone, speech recognition, or provider access is unavailable.

## Verification
- Check the current build and preview logs.
- Exercise session selection, live-camera cue handling, voice input/reply states, homework submission, required homework review, and local persistence in the browser.
- Verify the Fish Audio request after the API key is entered securely; until then, verify the endpoint's missing-key state without exposing credentials.
