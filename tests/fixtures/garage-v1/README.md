# Published v1.3.0 garage fixtures

The six JavaScript files in this directory are byte-for-byte copies of the
published `src/` dependency closure at
`1c745a90258d0f6cb968935f773354cff702b276`. They retain their original relative
imports and Apache-2.0 SPDX headers. [provenance.json](provenance.json) records
their exact source and SHA-256 values; migration tests verify all six hashes.
Do not update these files to follow the current save format.

`states.json` contains eighteen states produced by this exact published
validator and transaction API. Ordinary fixtures begin with the published
2,400-credit garage, buy real catalogue cars and use accepted purchase, sale
and selection transitions. The exhausted serial/revision and maximum-field
fixtures are explicitly labelled synthetic validator boundary inputs, not
earned money or real transaction outcomes.

The migration suite imports the **actual old vault implementation** here to
test old buy/reset/import confirmation conflicts against the new runtime. It
does not substitute a simplified old-tab transaction mock. These fixtures are
development-only and stay outside the production asset allowlist.
