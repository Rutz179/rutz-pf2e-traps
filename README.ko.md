# Rutz's Traps

[Patreon](https://www.patreon.com/Rutz179) · [디스코드](https://discord.gg/pnVW5QmXKx) · [위키](https://github.com/Rutz179/rutz-pf2e-traps/wiki/한국어-안내) · [English](README.md)

플레이어가 GM 몰래 함정을 깔고, 무언가 밟으면 그제야 GM이 알게 됩니다. Foundry VTT용 — PF2e·D&D 5e 규칙 내장, 다른 시스템은 일반 DC로 동작합니다.

<img src="media/EN_07.png" alt="함정 발동 — 덫, DC, 밟은 캐릭터와 설치한 캐릭터가 보이는 GM 창" width="760">

## 할 수 있는 것
- **숨겨진 PC 함정** — GM이 함정 설치 시간을 열면, 플레이어가 파티 가방 속 덫·함정·독·마름쇠를 지도에 깝니다. 표시는 플레이어에게만 보입니다.
- **발동** — 함정 칸에 들어선 크리처는 그 칸에 멈추고, GM에게 아이템을 사용한 것처럼 함정이 뜹니다. DC가 이미 들어간 설명, 누가 밟았는지, 누가 깔았는지. 채팅에 공개하거나, 비밀로 두거나, 다시 무장하거나, 치웁니다.
- **GM 함정** — 아이템이나 위험(Hazard)을 GM 창에 끌어 놓거나(또는 이름과 DC만 적고) 칸을 클릭합니다.
- **몰래 보기** — GM이 PC 함정 위치를 몇 초 동안 볼 수 있습니다. 아무에게도 알리지 않거나, 채팅에 한 줄 남기거나(설정).
- **레벨에 맞는 DC** — 상점에서 산 덫의 DC는 상대할 몬스터에게 너무 낮아서, 기본으로는 '설치한 캐릭터 레벨 DC + 2'가 더 높으면 그것을 씁니다: PF2e는 GM Core DC, D&D 5e는 8 + 숙련 보너스 + 3, 그 밖은 10 + 레벨의 절반.
- 다른 모듈 없이 혼자 동작합니다.

<img src="media/EN_04.png" alt="플레이어의 함정 설치 창 — 파티 가방 속 덫" height="300"> <img src="media/EN_02.png" alt="GM의 함정 창" height="300">

## 설치
Foundry → *Add-on Modules* → *Install Module* → Manifest URL:
```
https://github.com/Rutz179/rutz-pf2e-traps/releases/latest/download/module.json
```
Foundry VTT v13–v14 · PF2e · D&D 5e · 모든 시스템 · 한국어 / English (Foundry 언어 설정을 따름)

## 빠른 시작
1. GM: 토큰 도구의 **함정 (GM)** → **설치 시간 열기**.
2. 플레이어: **함정 설치** 창이 열립니다 — 함정 옆 **설치** → 지도 칸 클릭. **다 깔았어요**를 누르면 GM에게 몇 개인지만(위치는 빼고) 알립니다.
3. GM: **설치 시간 닫기** 하고 진행합니다. 크리처가 함정 칸에 들어서면 GM 화면에 함정 창이 뜹니다.

전체 안내: **[위키](https://github.com/Rutz179/rutz-pf2e-traps/wiki/한국어-안내)** · 매크로: `game.rutzTraps.open()`

질문·버그 제보: [Issues](https://github.com/Rutz179/rutz-pf2e-traps/issues) 또는 [디스코드](https://discord.gg/pnVW5QmXKx).
