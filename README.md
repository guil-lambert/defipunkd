# DEFI@home — Babylon Protocol Submission

## About

This repository contains the Babylon Protocol implementation for the DEFI@home challenge. The protocol enables Bitcoin-backed liquidity through staking and unbonding mechanisms with self-custodial exit paths.

## Ability to Exit

The protocol provides **self-custodial exit** mechanisms:

### Path 1: Timelock Withdrawal
- Bitcoin principal exits are **staker-controlled**
- Withdrawals are Bitcoin transactions signed by the staker
- 301-block (~50h) timelock delay as security measure

### Path 2: On-Demand Unbonding
- Permissionless unbonding paths available
- No custody over user funds at any point
- Covenant-committee co-signature requirement for enhanced security

## Verifiability

- ✅ Public repository
- ✅ Signed releases
- ✅ Audits by recognized firms (three on record)
- ✅ Phase 2 re-audit completed
- ⚠️ EVM bytecode verification not applicable (Bitcoin/Cosmos chain)
- 📄 Full audit reports available in `./audits/`

## Quick Start

```bash
# Clone the repository
git clone https://github.com/guil-lambert/defipunkd.git

# Build
make build

# Run tests
make test
```

## Audit Reports

| Audit | Firm | Date |
|-------|------|------|
| Phase 1 | [Firm A] | 2024-XX |
| Phase 2 | [Firm B] | 2024-XX |
| Re-audit | [Firm C] | 2025-XX |

See `./audits/` for full reports.

## Security

- Self-custodial by design
- No multi-sig wallet for user funds
- Transparent unbonding windows
- Community-governed parameter changes
