from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Defenses(BaseModel):
    firmware_verification: bool = False
    independent_metering: bool = True
    external_limiter: bool = False
    limiter_fraction: float = Field(0.95, ge=0.1, le=1)
    canary_rollout: bool = False
    canary_fraction: float = Field(0.1, ge=0, le=1)
    auto_quarantine: bool = False


class Config(BaseModel):
    scenario: Literal['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'] = 'S0'
    fleet_size: int = Field(60, ge=4, le=300)
    compromised_fraction: float = Field(0.5, ge=0, le=1)
    connection_rate: float = Field(0.8, ge=0, le=1)
    charger_rating_kw: float = Field(22, gt=0, le=350)
    baseline_fraction: float = Field(0.4, ge=0, le=1)
    vehicle_acceptance_kw: float = Field(22, gt=0, le=350)
    physical_authority: bool = True
    load_change_fraction: float = Field(0.9, ge=-1, le=1)
    telemetry_distortion: float = Field(-0.35, ge=-2, le=2)
    falsification_class: Literal['F1', 'F2'] = 'F2'
    feeder_count: int = Field(3, ge=1, le=8)
    feeder_capacity_kva: float = Field(450, ge=10, le=100000)
    feeder_base_kw: float = Field(160, ge=0, le=100000)
    base_power_factor: float = Field(0.95, ge=0.5, le=1)
    concentration: float = Field(0, ge=0, le=1)
    duration_steps: int = Field(90, ge=60, le=360)
    step_seconds: int = Field(60, ge=1, le=600)
    onset_step: int = Field(15, ge=1)
    attack_duration_steps: int = Field(45, ge=1)
    trigger_dispersion_steps: int = Field(3, ge=0, le=120)
    ramp_steps: int = Field(3, ge=1, le=60)
    sensing_coverage: float = Field(1, ge=0, le=1)
    sensor_noise_kw: float = Field(0.08, ge=0, le=20)
    detection_threshold_kw: float = Field(2, gt=0, le=1000)
    sustained_steps: int = Field(2, ge=1, le=10)
    mitigation_delay_steps: int = Field(2, ge=0, le=60)
    signature_valid: bool = False
    version_monotonic: bool = True
    hardware_compatible: bool = True
    seed: int = Field(20261009, ge=0, le=4294967295)
    defenses: Defenses = Field(default_factory=Defenses)

    @model_validator(mode='after')
    def valid_timing(self):
        if self.onset_step >= self.duration_steps:
            raise ValueError('Scenario onset must precede the end of the simulation')
        return self


class StepRequest(BaseModel):
    steps: int = Field(1, ge=1, le=360)


class ControlRequest(BaseModel):
    action: Literal['pause', 'resume', 'reset', 'finish']


class StationAction(BaseModel):
    action: Literal['quarantine', 'recover']


class CompareRequest(BaseModel):
    config: Config
    mode: Literal['defenses', 'concentration', 'sensing', 'fraction'] = 'defenses'


class RunSummary(BaseModel):
    id: str
    created_at: str
    config: Config
    cursor: int
    status: Literal['paused', 'playing', 'completed']
