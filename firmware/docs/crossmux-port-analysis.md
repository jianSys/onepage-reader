# CrossMux 移植分析（Phase 0 基线报告）

> 目的：为"OnePage 固件全面对齐 CrossMux"提供事实基线——记录 CrossMux 相对我们的分叉规模、
> 每个功能的模块映射、依赖类型与 C61 风险，作为路线图 P2-P6 的移植依据。
> 数据来源：`git remote add crossmux https://github.com/0x1abin/crossmux.git` + `git fetch --depth=1 crossmux main`（下文所有数字均由 `git ls-tree`/`git show` 实测）。

## 1. 血缘与版本对照

| | 我们 (crosspoint-onepage) | CrossMux (0x1abin/crossmux) |
|---|---|---|
| 上游 | CrossPoint Reader | CrossPoint Reader（社区 fork） |
| `[crosspoint] version` | **1.4.1** | **1.6.5** |
| 许可证 | MIT（保留 CrossPoint 版权） | MIT |
| 目标芯片 | ESP32-**C61**（自研板）+ C3 开发环境 | ESP32-C3 / ESP32-**S3**（X3/X4/Sticky/X4Pro/eego A4/Murphy M4/PaperMono/readpico…） |

**结论：两条从 CrossPoint 分出的平行 fork，且 CrossMux 的 core 领先我们 2 个 minor（1.4.1 → 1.6.5）。**
这意味着移植一个 CrossMux app 时，它可能连带依赖 1.6.5 代 core 的接口（渲染、存储、活动框架），
不能假设在 1.4.1 基座上零改动编译通过——每个功能移植都要按"先补 core 依赖，再落 app"的顺序处理。

## 2. 分叉规模（当前基线，附局限）

- 本次为 **shallow fetch（depth=1）**：`git merge-base main crossmux/main` 返回空，
  **尚无法计算真正的 git 共同祖先**，也做不了逐 commit 三方 diff。
- 可行的替代基线（本报告采用）：**版本差（1.4.1 vs 1.6.5）+ 目录结构 diff**。
- 待办：若需要真正的三方合并粒度，需 `git fetch --unshallow crossmux`（体积大、当前网络不稳，暂缓）。

## 3. 关键约束（C61 独有性，已证实）

- **CrossMux 完全没有 C61 target**：其 `[env:*]` 只有 C3(`default`) 与 S3 系列
  （`sticky`/`x4pro`/`x4c`/`eego_a4`/`murphy_m4`/`readpico`）。全仓 grep "c61" 命中的都是字体文件里的子串误报，无一是构建环境或板级代码。
  → **C61 板级支持（`open-onepage-sdk` 驱动、`boards/onepage-c61.json`、`platformio.ini` 的 `[env:onepage]` + `custom_sdkconfig`）是我们独有、CrossMux 代码里没有的。**
- **C61 电源管理不成熟**：[platformio.ini](../platformio.ini) 注明 system light-sleep / PM（`CONFIG_PM_ENABLE` + tickless idle + MAC-BB-PD）当前在本 C61 构建上 **UNBUILDABLE**；BLE modem-sleep 也有一堆手工 sdkconfig 约束。
  → 任何"持续联网"功能（AirPage 的 MQTT 前台实时推送、WeRead 在线同步）落地时续航/稳定性风险最高。
- **C61 无 DS3231 RTC**（X3 才有）：待机表盘/万年历的走时依赖我们既有的 `HalTime`（手机校时）那套。

## 4. CrossMux 功能清单 → 模块映射与风险

CrossMux 的应用都挂在 `src/activities/apps/`（共 **138** 文件），由 `AppsMenuActivity` + 共享底座驱动。
下列每行的"文件数"为该 app 目录实测文件量；"依赖"分 **纯 app / HAL 相关 / 网络相关**；"C61 风险"综合 PM/RTC/字体约束判断。

### 4.1 共享底座（移植任何游戏前必须先落）
| CrossMux 路径 | 作用 | 映射到我们 | 依赖 | 风险 |
|---|---|---|---|---|
| `apps/AppsMenuActivity` | 应用中心 hub | 我们的 `ToolApp`/`ToolsMenuActivity` 已充当此角色 | 纯 app | 低 |
| `apps/GameUi.{h,cpp}` | 游戏通用绘制 | 新增 `src/activities/apps/GameUi`（或并入 `ToolsUi`） | 纯 app | 低 |
| `apps/GameSaveDebouncer.h` | 存档防抖落盘 | 同上，配合 SD 存储 | 纯 app + 存储 | 低 |

> 决策点（见第 6 节）：CrossMux 用 `AppsMenuActivity`，我们已有 `ToolApp` 注册表。移植时应**统一到一套底座**，不要并存两套入口。

### 4.2 游戏中心（P2，整体低风险，可离线移植）
| App（CrossMux） | 文件数 | C61 风险 | 备注 |
|---|---|---|---|
| `2048/` | 6 | 低 | 纯逻辑 + GameUi |
| `sudoku/` | 10 | 低 | 含生成器 + 存档 |
| `gomoku/` | 10 | 低 | 本地对战 |
| `minesweeper/` | 10 | 低 | — |
| `chinese-chess/` | 10 | 低-中 | **依赖 `lib/EpdFont/builtinFonts/chinese_chess_16.h` 棋子字体**，需一并移植/重生成 |
| `sokoban/` | 7 | 低 | 推箱子 |
| `woodfish/` | 5 | 低 | 电子木鱼 |
| `pixel-switch/` | 4 | 低 | — |
| `avatar/` + `lib/AvatarGen/` | 2 + ~13 | 低-中 | 丑脸生成，依赖 AvatarGen 贝塞尔/脸型库 |
| `buddy/` | 5 | 低-中 | 需确认是否依赖联网（暂列观察） |

### 4.3 阅读统计（P3，低-中）
| App | 文件数 | 风险 | 备注 |
|---|---|---|---|
| `reading-stats/` | **23** | 中 | 比我们现有 `ReadingStatsActivity`（227 行单文件）大得多：热力图/成就/多视图。**移植时一并解决**我们已知的横屏负高度崩点；依赖按天历史持久化 store（1.6.5 core 是否已有需核对）。 |

### 4.4 待机表盘 / 万年历（P4，中）
| App | 文件数 | 风险 | 备注 |
|---|---|---|---|
| `standby/` | 11 | 中 | 时钟/老黄历表盘；依赖 `cn_almanac_chars.txt` 相关字体与农历数据；走时受限于 C61 无 RTC（用 `HalTime` + 校时）。可与我们既有 `ClockLockScreen` 合并设计。 |

### 4.5 AirPage 实时推送（P5，高）
| App | 文件数 | 风险 | 备注 |
|---|---|---|---|
| `airpage/` | 12 | **高** | 含 `AirPageConnection`（**MQTT** 前台实时投递）/ `AirPageDeviceId` / 显示重试。我们已有 `/airpage` HTTP 上传端点雏形，但 MQTT 常连在 C61 上与 PM/light-sleep 缺失直接冲突——续航风险最高。建议先做 HTTP 单帧路径，MQTT 实时独立评估。 |

### 4.6 微信读书 WeRead（P6，最高）
| App / lib | 文件数 | 风险 | 备注 |
|---|---|---|---|
| `weread/` (activity) | 12 | **最高** | 扫码登录/书架/下载/进度同步，活跃联网。 |
| `lib/WeReadWebApi/` | ~20 | **最高** | 完整客户端栈：`WeReadClient/Protocol/HttpClient/Store/XhtmlCodec/Browse`。 |
| 安全 | — | — | CrossMux 自带 `test_weread_tls_config.py`，但其对外文档仍警告**客户端不校验服务器证书/主机名**。原样引入=携带已知不安全网络栈，需在第 7 节风险下决策。 |

## 5. 连带 core 依赖（1.6.5 → 1.4.1 落差）

移植任一 app 时，优先排查它是否引用了我们没有的 1.6.5 代接口：
- `lib/` 新增：`WeReadWebApi`、`AvatarGen`（各约 13-20 文件）——整块引入相对自洽，作为独立 lib 移植较干净。
- 字体：`chinese_chess_16.h`、`notosans_cjk_*.h` 扩充、`cn_almanac_chars.txt`——需过我们的字体生成/裁剪管线（`scripts/generate-font-manifest.py` 等），不能只拷 header。
- i18n：CrossMux 33 语言 vs 我们中英繁——**只移植所需键**，勿整表替换（见既有 i18n 裁剪策略）。
- `MainTab.h` / `UiTabListActivity` 等导航结构差异：我们 Home 菜单与 `ToolApp` 体系不同，接入 app hub 时以我们的注册表为准。

## 6. 与现有 tools 的重叠（须先定"保留 vs 替换"）

我们现在有 8 个自研 tools：Pomodoro / Calendar / Calculator / Dictionary / Notification / Bookshelf(+Store) / ReadingStats + `ToolApp` 注册表。
CrossMux 对应项：
- **Calculator**：两边都有 → 选一个权威实现。
- **ReadingStats**：两边都有，crossmux 版更全（23 文件）→ 决定"升级我们的"还是"整体替换"。
- **standby ↔ ClockLockScreen**、**airpage ↔ `/airpage` 端点**：功能重叠，移植时合并而非并存。
- **CrossMux 独有、我们没有**：全部游戏、weread、avatar、sokoban、woodfish 等 → 净新增。
- **我们独有、CrossMux 没有**：Dictionary（SD 词典文件）、Notification（iOS ANCS 经 BLE）、Bookshelf(+收藏) → **保留**，这些是我们差异化。

> 原则：以我们的 `ToolApp` 注册表为唯一 hub，把 CrossMux 的 app 作为"新增行 + 新 Activity"接进来；重叠项统一到一套实现。

## 7. 建议移植顺序（对齐路线图 P2-P6）

1. **P2a 底座**：GameUi + GameSaveDebouncer 接入（或并入 ToolsUi），确定 hub 单一化。
2. **P2b 游戏（低风险铺量）**：2048 → sudoku → minesweeper → gomoku → sokoban/woodfish/pixel-switch → chinese-chess(带字体) → avatar(带 AvatarGen)。
3. **P3 阅读统计深化**：CrossMux reading-stats（含历史 store），顺带修横屏崩点。
4. **P4 待机表盘/万年历**：standby 并入 ClockLockScreen 体系（含农历/字体）。
5. **P5 AirPage**：先 HTTP 单帧，后 MQTT 实时（续航专项评估）。
6. **P6 WeRead**：最后、可选；带安全告警决策。
每个里程碑动手前各自出细化子计划。

## 8. 授权待办（MIT 合规，见 Phase 1）

- 新建 `firmware/NOTICE` 登记 CrossMux（0x1abin/crossmux, MIT）为衍生来源。
- 从 CrossMux 移植的文件在头部**保留其原版权/MIT 声明**；LICENSE/README 致谢同步。
- 逐功能落地时在 NOTICE 追加对应条目。

## 9. 未决项

- **web manifest 下发 `crossmux-onepage.bin`**：`web/public/firmware/manifest.json` 现在把 C61 安装镜像指向 CrossMux 编译产物（6.8MB，直接进 git）。本次**先不改** web 行为；待路线图推进后，再定夺"用我们自研 C61 build 替换"还是"有意保留 crossmux 包"。
- **真正的三方 diff**：需要时 `git fetch --unshallow crossmux` 后按 merge-base 精算 core 落差（当前网络不稳，暂缓）。
