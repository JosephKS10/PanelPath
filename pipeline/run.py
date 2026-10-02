"""Run pipeline stages: python -m pipeline.run --stage all|<stage>."""
import argparse
import logging

log = logging.getLogger("pipeline")


def _stub(name: str):
    def run() -> None:
        log.info("stage %s: not implemented", name)
    return run


# Order matters for --stage all. Replace each stub with the real module's run() as steps land.
STAGES = {name: _stub(name) for name in
          ["clean", "geography", "cohorts", "retire", "fit", "optimise", "validate", "export"]}


def main() -> None:
    """Parse --stage and run that stage, or every stage in order."""
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--stage", required=True, choices=[*STAGES, "all"])
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for name in (STAGES if args.stage == "all" else [args.stage]):
        STAGES[name]()


if __name__ == "__main__":
    main()
