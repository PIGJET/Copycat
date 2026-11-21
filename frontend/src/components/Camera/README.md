# Recorder handoff

The Game lane can use `prepareReference(videoUrl, signal)` from `utils/referenceRecorder.ts`.
Give it the object URL of the imported or locally selected clip. Prepare the reference
once per clip and reuse the returned poses for every player.

Mount `ChallengeRecorder` with `reference`, `playerId`, `onFeedback`, `onComplete`,
and `onError`. Use a fresh React key for each player turn and when replacing the
reference. The Recorder owns the countdown, playback and webcam. Clear the visible
rating when a turn fails or changes. The feedback callback supplies provisional
ratings and a null score when poses cannot be compared.

A completed turn returns `{ playerId, recording, video }`. Send
`{ reference: reference.recording, attempt: result.recording }` to `POST /score`.
Keep `result.video.blob` local and use its actual MIME type. For replay, reference
milliseconds map directly to the reference MP4. Convert attempt milliseconds with
`attemptToVideoMs(attemptMs, result.video.attemptPoseZeroInVideoMs)` and divide by 1000
before setting the webcam replay's `currentTime`. Game owns its replay Blob URL and
should revoke it when the player moves on. See `types/challenge.ts` for result types.

Verify from `frontend/` with `node --test src/utils/*.test.mjs`, `npm run build`, and
`npm run lint`. The browser check uses the 0:05–0:10 section of YouTube video
`i-54NhTqlH8`. It exercises a native Chrome recording with a simulated camera,
including an interrupted turn and technical retry. A hardware camera rehearsal
is still needed before relying on the measured timing on the demo laptop.
