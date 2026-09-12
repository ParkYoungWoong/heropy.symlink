# @heropy/symlink

폴더를 심볼릭 링크로 묶어 어느 운영체제에서나 같은 구조를 유지합니다.

[![npm version](https://img.shields.io/npm/v/@heropy/symlink?color=cb3837&logo=npm)](https://www.npmjs.com/package/@heropy/symlink)
[![node](https://img.shields.io/node/v/@heropy/symlink?color=5fa04e&logo=node.js&logoColor=white)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@heropy/symlink?color=444)](./LICENSE)

[English](./README.md)

같은 폴더 묶음을 두 곳 이상에 두어야 할 때가 있습니다.  
복사해 두면 같은 내용이 두 벌이 되고, 한쪽만 고치는 순간 둘은 어긋나기 시작합니다.  
이 도구는 실체를 한 곳에만 두고 나머지 경로가 그 폴더를 가리키게 만듭니다.

```bash
npx @heropy/symlink .claude/skills .agents/skills
```

```
link   .agents/skills/heropy-commit-push -> ../../.claude/skills/heropy-commit-push
link   .claude/skills/react-router -> ../../.agents/skills/react-router

2 linked
```

이제 두 폴더가 같은 이름을 갖습니다.  
`heropy-commit-push`는 `.claude/skills`에 실체가 있고 `.agents/skills`에서 링크로 연결되며, `react-router`는 그 반대입니다.  
어느 경로에서 고치든 같은 파일을 고치는 것입니다.

## 왜 필요한가

에이전트 스킬은 `SKILL.md`가 들어 있는 폴더 하나지만, 도구마다 그 폴더를 찾는 경로가 다릅니다.  
Claude Code는 `.claude/skills`를, Codex와 Gemini CLI는 `.agents/skills`를 읽고, Cursor는 여러 곳을 봅니다.  
한 저장소에서 두 도구를 함께 쓰는 순간 같은 스킬이 두 경로에 모두 존재해야 합니다.

스킬은 이 도구를 만들게 된 사례일 뿐입니다.  
공용 설정, 테스트 픽스처, 프롬프트 모음, 정적 자산처럼 도구마다 정해진 자리에서 찾으려 드는 것은 모두 같은 문제를 겪습니다.

## 사용법

```bash
npx @heropy/symlink <폴더> <폴더> [폴더...] [옵션]
npx @heropy/symlink [폴더...] --list
```

인수의 순서는 의미가 없습니다.  
실체 폴더를 가진 쪽이 원본이 되고 나머지에 링크가 생깁니다.  
경로는 실행 위치 기준의 상대 경로와 절대 경로를 모두 받으며, 아직 없는 폴더는 만들어 줍니다.

| 옵션 | 설명 |
| --- | --- |
| `--list` | 주어진 폴더 안의 링크와 그 대상을 보고합니다. 읽기만 합니다. |
| `--only <이름>` | 지정한 이름만 처리합니다. 옵션을 여러 번 쓰거나 쉼표로 나열합니다. |
| `--unlink` | 이 도구가 만든 링크를 지웁니다. 실체는 건드리지 않습니다. |
| `--dry-run` | 아무것도 쓰지 않고 무엇이 바뀔지만 출력합니다. |
| `-h`, `--help` | 도움말을 봅니다. |
| `-v`, `--version` | 버전을 봅니다. |

```bash
# 먼저 무엇이 바뀔지 확인
npx @heropy/symlink .claude/skills .agents/skills --dry-run

# 세 곳을 한 번에
npx @heropy/symlink .claude/skills .agents/skills .gemini/skills

# 한 항목만
npx @heropy/symlink .claude/skills .agents/skills --only my-skill

# 링크만 걷어 내기
npx @heropy/symlink .claude/skills .agents/skills --unlink
```

## 항목마다 무엇을 하는가

| 출력 | 뜻 |
| --- | --- |
| `link` | 이쪽에 없어서 링크를 만들었습니다. |
| `keep` | 이미 바른 곳을 가리키고 있어 그대로 두었습니다. |
| `fix` | 다른 곳이나 사라진 곳을 가리켜 다시 만들었습니다. |
| `skip` | 손대지 않았습니다. 이유를 옆에 적습니다. |

이 명령은 멱등합니다.  
두 번째 실행부터는 모든 항목이 `keep`으로 보고되고 디스크에는 아무것도 쓰지 않으므로, `postinstall` 스크립트에 넣거나 습관처럼 다시 실행해도 안전합니다.

자리를 비우려고 무언가를 지우는 일은 없습니다.  
같은 이름의 실체가 두 곳 이상에 있을 때, 그 이름을 이미 파일이 쓰고 있을 때, 실체가 사라지고 링크만 남았을 때는 건너뛰고 그 이유를 알려 줍니다.  
직접 정리한 뒤 다시 실행하면 됩니다.

미러링의 단위는 폴더입니다.  
폴더 안에 섞여 있는 `README.md` 같은 파일은 그 자리에 그대로 둡니다.

## 링크 목록 보기

`--list`는 주어진 폴더의 트리 전체를 훑어 그 안의 심볼릭 링크를 보고합니다.  
아무것도 쓰거나 만들지 않고, 링크를 타고 내려가지도 않으므로 순환에 빠지지 않습니다.  
폴더를 주지 않으면 실행 위치에서 시작합니다.

```bash
npx @heropy/symlink --list
npx @heropy/symlink .claude .agents --list
npx @heropy/symlink . --list --only my-skill
```

```
ok     .claude/skills/react-router -> ../../.agents/skills/react-router
broken .claude/skills/old-skill -> ../../.agents/skills/old-skill

2 links, 1 broken
```

`broken`은 가리키는 곳에 아무것도 남아 있지 않다는 뜻입니다.  
깨진 링크가 하나라도 있으면 종료 코드 `1`로 끝나므로 CI의 점검 단계로도 쓸 수 있습니다.  
`node_modules`와 `.git`은 훑지 않습니다.

## 운영체제

macOS와 리눅스에서는 상대 경로를 가리키는 심볼릭 링크를 만듭니다.  
프로젝트를 다른 위치로 옮기거나 다른 사람이 저장소를 복제해도 링크가 그대로 유지됩니다.

윈도우에서는 디렉터리 정션(junction)을 만듭니다.  
개발자 모드나 관리자 권한이 필요 없습니다.  
다만 정션은 절대 경로만 가리킬 수 있어서 윈도우에서 만든 링크는 그 컴퓨터에서만 의미가 있습니다.  
Git은 심볼릭 링크를 파일 모드 `120000`으로 기록해 다른 환경으로 옮겨 주지만, 정션은 심볼릭 링크가 아니라 보통 폴더로 보이므로 윈도우에서 만든 링크를 커밋할 생각은 하지 않는 편이 좋습니다.

파일은 일부러 지원하지 않습니다.  
윈도우에서 파일 심볼릭 링크는 개발자 모드나 관리자 권한을 요구합니다.  
세 곳에서는 되고 한 곳에서만 실패하는 도구보다, 처음부터 폴더만 다루는 도구가 낫다고 보았습니다.

## API

```ts
import { symlink, list } from '@heropy/symlink'

const result = await symlink(['.claude/skills', '.agents/skills'], {
  dryRun: false,
  unlink: false,
  only: ['my-skill'],
  cwd: process.cwd()
})

result.dirs // 중복을 제거한 절대 경로
result.created // 없어서 만든 폴더
result.counts // { linked, kept, fixed, skipped, unlinked }
result.items // 이름과 폴더마다 하나씩
```

각 항목은 이름(`name`), 처리 결과(`status`), 링크의 절대 경로(`path`), 가리키는 실체(`source`), 실제로 기록한 값(`target`), 건너뛴 이유(`reason`)를 담습니다.

```ts
const { links, counts } = await list(['.agents'], { only: ['my-skill'] })

links // [{ name, path, target, destination, broken }]
counts // { total, broken }
```

잘못된 입력은 `SymlinkError`를 던지고 `code`로 `INVALID_ARGS`, `NOT_FOUND`, `NOT_A_DIRECTORY`, `SAME_DIRECTORY`를 구분합니다.  
그 밖의 상황은 예외 대신 결과에 담아 돌려줍니다.

## 요구 사항

Node.js 20.19 이상.  
의존성은 없습니다.

## 라이선스

MIT
