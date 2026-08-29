# Verifying the form filler

`fillForm` draws onto official PDFs at measured coordinates. A map that parses is **not** a map
that is correct, and the two failure modes are invisible to a type checker:

- a value landing in the wrong cell, and
- a coordinate-origin or rotation mistake putting everything in the wrong place.

So the only real test is to fill a form and **look at it**.

```bash
node src/lib/compliance/__tests__/fillForm.manual.mjs      # writes /tmp/build/pdflib-doh2040.pdf
/tmp/nyforms/.venv/bin/python -c "import pymupdf; \
  pymupdf.open('/tmp/build/pdflib-doh2040.pdf')[0].get_pixmap(dpi=110).save('/tmp/out.png')"
```

Then open the PNG and check: values inside their cells, ticks on the right rows, nothing over a
printed label, nothing off the page.

Two bugs were caught this way that all other checks passed:
1. `true` rendered instead of `X`, because checkbox-ness was being inferred from the map's prose
   notes — and the page-number column carries the same "X mark" wording as the tick columns.
   Semantics now come from the value's **type**: boolean → tick, string → literal.
2. Centred fields were offset by half a text width, because the maps give the column **centre**
   as `x` while the code treated it as a left edge.
