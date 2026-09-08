#!/usr/bin/env node
/**
 * evidence.mjs — shim, not the implementation.
 *
 * The collector's single source of truth lives with the skill it ships
 * (skills/weekly-report/evidence.mjs): a plugin copies only `skills/weekly-report/`,
 * so the installed skill must always carry the real code. This shim exists so
 * the local eval suite (scripts/eval/run.mjs) invokes the SAME file the skill
 * runs — `node scripts/evidence.mjs <dir> --days N` just forwards the args.
 *
 * Do NOT edit logic here: edit skills/weekly-report/evidence.mjs and this
 * shim stays a one-liner. (Before this shim existed, the two files were
 * hand-mirrored and CI could not tell when they drifted apart.)
 */
import "../skills/weekly-report/evidence.mjs";
