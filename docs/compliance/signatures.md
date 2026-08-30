# Signing the forms

**Recommendation: do not draw signatures into these PDFs. Print, sign, scan, and file the scan
as the camp's copy.**

## Why not, when e-signatures are usually fine

E-signatures are generally valid. The federal ESIGN Act and New York's Electronic Signatures and
Records Act (ESRA) both give an electronic signature the same legal effect as ink. That is the
part people remember, and it is why the question comes up.

It is not the part that decides this. Two things do.

**The receiving agency decides what it accepts.** ESRA gives a state agency the authority to
determine whether, and in what form, it will accept electronic signatures for a given filing.
DOH-367 prints a signature rule, a printed-name line and a date, and neither the form nor the
Westchester application packet says an electronic signature is accepted. Until the county says
otherwise, the safe assumption is that they expect the signature they printed a line for.

**The signer is certifying, not agreeing.** The line above it reads "I certify that the
information given in this form is true." That is an attestation by a named person, and several
of the values on the page were put there by us. If we also place the mark that certifies them,
the product has moved from preparing a document to executing one, and a camp director who
clicked a button in a compliance tool has a much weaker account of what they personally checked
than one who printed the form and signed it.

The second reason is the one that matters even if the county said yes tomorrow.

## What we do instead

- Fill everything else, and leave the signature block empty. The detail page lists it as
  **wet ink, after you print it**, so nobody is waiting for the software to do it.
- The camp prints, signs, and files.
- They upload the signed scan under Documents, which becomes the record of what was actually
  filed. That copy is worth more than a generated one: it is the document the county holds.

## What would change this

A camp or a county telling us, in writing, that Westchester accepts an electronically signed
DOH-367. At that point the honest implementation is not a drawn squiggle pasted into a PDF but a
real e-signature: identity of the signer, intent captured at the moment of signing, and a
tamper-evident audit trail bound to the document. That is a different feature from a drawing
canvas, and it should not be built until somebody actually needs it.

## The related question: is linking to the county's own guidance a liability?

No, and it is worth keeping. Linking to a government page is provenance, not advice. It is how a
camp checks our reading of a rule against the county's own words, which is the opposite of
risky, and it costs us nothing to be wrong about because the source is right there.

The only real failure mode is the link rotting, which is what happened: the county moved from
`health.westchestergov.com` to `health.westchestercountyny.gov` and changed the path, so it
404'd. Fixed, and worth re-checking when a season turns over.
