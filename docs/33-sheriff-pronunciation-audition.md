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
