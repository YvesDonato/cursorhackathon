{
  description = "NailFlow AI development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
      prismaTargetFor = system:
        if system == "aarch64-linux" then
          "linux-arm64-openssl-3.0.x"
        else
          "debian-openssl-3.0.x";
      prismaEngineFor = system: "schema-engine-${prismaTargetFor system}";
      perSystem = system:
        let
          pkgs = pkgsFor system;
          prismaTarget = prismaTargetFor system;
          prismaSchemaEngine = prismaEngineFor system;
          runtimeLibs = pkgs.lib.makeLibraryPath [
            pkgs.stdenv.cc.cc
            pkgs.glibc
            pkgs.sqlite
            pkgs.openssl
            pkgs.zlib
          ];
          nativePackages = with pkgs; [
            nodejs_22
            python3
            pkg-config
            gcc
            gnumake
            sqlite
            openssl
            patchelf
            curl
            cloudflared
          ];
          prismaPrepareEngine = pkgs.writeShellApplication {
            name = "prisma-prepare-engine";
            runtimeInputs = with pkgs; [
              nodejs_22
              patchelf
            ];
            text = ''
              if [ ! -f package.json ]; then
                echo "Run this command from the repository root." >&2
                exit 1
              fi

              export PRISMA_BINARY_TARGET="''${PRISMA_BINARY_TARGET:-${prismaTarget}}"
              export LD_LIBRARY_PATH="${runtimeLibs}:''${LD_LIBRARY_PATH:-}"

              prisma_engine="node_modules/@prisma/engines/${prismaSchemaEngine}"

              if [ ! -d node_modules ]; then
                echo "node_modules is missing. Run npm ci first." >&2
                exit 1
              fi

              if [ ! -x "$prisma_engine" ]; then
                PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 node <<'NODE'
              const path = require('node:path')
              const { download, BinaryType } = require('@prisma/fetch-engine')
              const { enginesVersion } = require('@prisma/engines-version')

              delete process.env.PRISMA_SCHEMA_ENGINE_BINARY

              async function main() {
                await download({
                  binaries: {
                    [BinaryType.SchemaEngineBinary]: path.join(process.cwd(), 'node_modules/@prisma/engines'),
                  },
                  binaryTargets: [process.env.PRISMA_BINARY_TARGET],
                  version: enginesVersion,
                  showProgress: true,
                })
              }

              main().catch((error) => {
                console.error(error)
                process.exit(1)
              })
              NODE
              fi

              if [ ! -x "$prisma_engine" ]; then
                echo "Prisma schema engine was not installed at $prisma_engine." >&2
                exit 1
              fi

              chmod +w "$prisma_engine"
              patchelf --set-interpreter "$(cat ${pkgs.stdenv.cc}/nix-support/dynamic-linker)" \
                --set-rpath "${runtimeLibs}" \
                "$prisma_engine"

              echo "$PWD/$prisma_engine"
            '';
          };
          prismaPrepareEngineCompat = pkgs.writeShellApplication {
            name = "prisma_prepare_engine";
            runtimeInputs = [ prismaPrepareEngine ];
            text = ''
              exec prisma-prepare-engine "$@"
            '';
          };
          devEnv = pkgs.symlinkJoin {
            name = "naiflow-dev-env";
            paths = nativePackages ++ [
              prismaPrepareEngine
              prismaPrepareEngineCompat
            ];
            postBuild = ''
              mkdir -p "$out/nix-support"
              echo "${runtimeLibs}" > "$out/nix-support/runtime-libs"
              echo "${prismaTarget}" > "$out/nix-support/prisma-target"
              echo "${prismaSchemaEngine}" > "$out/nix-support/prisma-schema-engine"
            '';
          };
          setupCommand = ''
            if [ ! -f package.json ]; then
              echo "Run this command from the repository root." >&2
              exit 1
            fi

            if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
              npm ci
            fi

            prisma-prepare-engine >/dev/null
            npm exec -- prisma generate
          '';
          mkNixApp = name: description: command: {
            type = "app";
            program = "${pkgs.writeShellApplication {
              name = name;
              runtimeInputs = with pkgs; [
                bash
                nix
              ];
              checkPhase = "";
              text = ''
                if [ ! -f flake.nix ] || [ ! -f package.json ]; then
                  echo "Run this command from the repository root." >&2
                  exit 1
                fi

                exec nix develop . --command bash -c ${pkgs.lib.escapeShellArg command}
              '';
            }}/bin/${name}";
            meta.description = description;
          };
        in
        {
          inherit pkgs prismaTarget prismaSchemaEngine runtimeLibs nativePackages prismaPrepareEngine prismaPrepareEngineCompat devEnv setupCommand mkNixApp;
        };
    in
    {
      packages = forAllSystems (system:
        let
          cfg = perSystem system;
        in
        {
          prisma-prepare-engine = cfg.prismaPrepareEngine;
          prisma_prepare_engine = cfg.prismaPrepareEngineCompat;
          dev-env = cfg.devEnv;
          default = cfg.prismaPrepareEngine;
        });

      devShells = forAllSystems (system:
        let
          cfg = perSystem system;
        in
        {
          default = cfg.pkgs.mkShellNoCC {
            packages = cfg.nativePackages ++ [
              cfg.prismaPrepareEngine
              cfg.prismaPrepareEngineCompat
            ];

            shellHook = ''
              export DATABASE_URL="''${DATABASE_URL:-file:./dev.db}"
              export npm_config_build_from_source="''${npm_config_build_from_source:-true}"
              export PRISMA_BINARY_TARGET="''${PRISMA_BINARY_TARGET:-${cfg.prismaTarget}}"
              export PRISMA_SCHEMA_ENGINE_BINARY="$PWD/node_modules/@prisma/engines/${cfg.prismaSchemaEngine}"
              export LD_LIBRARY_PATH="${cfg.runtimeLibs}:''${LD_LIBRARY_PATH:-}"

              if [ -z "''${DIRENV_IN_ENVRC:-}" ]; then
                echo "NailFlow AI dev shell"
                echo "Run: npm ci && prisma-prepare-engine && npm exec -- prisma generate && npm exec -- prisma db push && npm run dev"
              fi
            '';
          };
        });

      apps = forAllSystems (system:
        let
          cfg = perSystem system;
        in
        rec {
          default = dev;

          dev = cfg.mkNixApp "naiflow-dev" "Install dependencies, prepare Prisma, and run the Vite dev server." ''
            ${cfg.setupCommand}
            npm exec -- prisma db push
            exec npm run dev -- --host 0.0.0.0
          '';

          tunnel = cfg.mkNixApp "naiflow-tunnel" "Run the Vite dev server and expose it through a Cloudflare Tunnel." ''
            ${cfg.setupCommand}
            npm exec -- prisma db push
            npm run dev -- --host 0.0.0.0 &
            dev_pid=$!

            cleanup() {
              kill "$dev_pid" 2>/dev/null || true
            }
            trap cleanup EXIT INT TERM

            for _ in $(seq 1 60); do
              if curl -fsS http://localhost:3000/ >/dev/null; then
                break
              fi
              sleep 0.5
            done

            exec cloudflared tunnel --url http://localhost:3000
          '';

          build = cfg.mkNixApp "naiflow-build" "Install dependencies, generate Prisma client, and build the app." ''
            ${cfg.setupCommand}
            npm run build
          '';
        });

      formatter = forAllSystems (system: (pkgsFor system).nixpkgs-fmt);
    };
}
