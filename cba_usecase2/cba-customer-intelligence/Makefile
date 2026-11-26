.PHONY: install demo test eval run full workbook collect serve link-skills clean

install:            ## install package + dev deps
	pip install -e ".[dev]"

demo:               ## offline end-to-end run on bundled sample data -> dist/index.html
	python -m ci demo

test:               ## unit + offline end-to-end tests
	python -m pytest -q

eval:               ## score the categoriser on evals/classification_golden.jsonl
	python -m ci.categorise.evaluate --mode rules

run:                ## full pipeline with live sources (needs .env)
	python -m ci run --mode hybrid

full:               ## full historical dataset (4 workbooks in data/input) -> dist/index.html
	python -m ci run --source "Workbook CBA" "Workbook ANZ" "Workbook NAB" "Workbook Westpac" --mode rules

workbook:           ## step scripts pipeline/01..05: collect -> process -> categorise -> enrich -> commbank-user-comments-analysed.xlsx
	python pipeline/run_all.py --preset workbooks

collect:
	python -m ci collect

serve:              ## HTTP API on :8000 (set CI_API_KEY in .env for POST endpoints)
	python -m ci serve

link-skills:        ## make skills discoverable by Claude Code
	sh scripts/link_skills.sh

clean:
	rm -f data/raw/*.csv data/interim/*.csv data/processed/*.csv data/reports/* dist/index.html
