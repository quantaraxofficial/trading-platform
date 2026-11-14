"""Tick collectors: one per data source. Each yields raw ticks, the resampler
turns them into 30-second bars, and the runner writes those to ClickHouse."""
