# Sheriff Pronunciation Correction

The user identified a pronunciation error in the V6 sheriff speech. In
`警长`, `长` must be pronounced `zhang` (third tone), not `chang`.
An ASR transcript or pitch statistics cannot establish that this polyphone
was spoken correctly; the previous review did not verify this distinction.

The generator now supports an isolated `--audition-instruction` override.
It requires explicit clip selection and rejects reuse or publication. Samples
and raw recordings stay under the ignored `.local-generation/auditions/`
directory, separate from the bank staging and immutable published assets.
The exact synthesis instruction is retained in the audition manifest.

Two candidates were generated offline using the existing pinned voice model:
`sheriff_speech` and `sheriff_hands`. The instruction identifies `警长` as a
job title and explicitly requests the pronunciation used in `长官`, `班长`
and `队长`, without speaking the pronunciation explanation aloud.
Canonical narration text is unchanged. Both MP3s decode successfully, contain
finite non-clipping samples, and match their recorded SHA-256 fingerprints.

Human pronunciation confirmation remains pending. Production still uses V6;
no published audio was replaced and no deployment was promoted. Once the
candidates are approved, integrate them into a new immutable audio version,
regenerate its pitch-preserving speed variants, and run asset verification.

## V7 Release

The user requested production publication after receiving these auditions.
V7 integrates those exact two samples without further synthesis. The other
46 original clips are byte-identical to V6. Its 96 pitch-preserving 1.5/2x
variants were regenerated using the existing FFmpeg atempo pipeline;
action durations and game logic are unchanged. V6 assets remain immutable.

Both replacement MP3s passed decoding, finite-sample, non-clipping and hash
checks. Offline ASR recognized the intended surrounding text, but rendered
the speech phrase as `竞长投票`; this is not proof of correct polyphone
pronunciation. Publication uses the exact samples presented to the user,
not a claim of independent human listening verification.

Type checking, lint, all 301 tests and the production build passed. The new
asset regression checks confirm exactly two changed originals and retained
pronunciation guidance. Candidate API checks verified all 48 originals and
96 speed variants, database readiness, secure cookies, request deduplication,
session isolation, origin rejection and SQL-shaped route rejection.

The candidate browser regression passed with eight isolated sessions in
1.3 minutes: optional trial, 96 pitch-safe assets, native playback rate 1,
silent guard/wolf timeout waits, late private feedback and persisted split
votes. This was a partial regression, not another complete game.

Application commit: `9f4b915d76dc2aed9b7edc79f6138dd53afa4537`.
Deployment: `dpl_CETgDzarNz7U46HZMbXbCGsVMeft`.
Candidate: https://werewolf-web-v2-9oag7kukq-barrylius-projects-d58e2788.vercel.app .
Production: https://werewolf-web-v2.vercel.app .
Audition: https://werewolf-web-v2.vercel.app/audio/host-zh-v7/index.html .

After manual promotion, Vercel readback confirmed this deployment and commit
as production with `autoAssignCustomDomains=false`. The production API and
all 144 audio fingerprints passed again. Exactly three rooms from this
release's QA reports were deleted using bound room IDs plus the `Cloud QA`
host-name condition; other rooms, schemas and permissions were untouched.
No new paid resources or services were enabled. Real-phone playback and
independent human pronunciation verification remain outside these checks.
