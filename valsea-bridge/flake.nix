{
  description = "FastAPI Twilio Media Streams to Valsea bridge";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      mkPkgs = system: import nixpkgs { inherit system; };
      mkPythonEnv = pkgs: pkgs.python312.withPackages (ps: [
        ps.fastapi
        ps.uvicorn
        ps.python-dotenv
        ps.httpx
        ps.websockets
      ]);
      mkCleanSource = pkgs: pkgs.lib.cleanSourceWith {
        src = ./.;
        filter = path: type:
          let
            name = baseNameOf path;
          in
          !(name == ".env"
            || name == ".venv"
            || name == ".git"
            || name == ".pi"
            || name == "__pycache__"
            || pkgs.lib.hasSuffix ".pyc" name);
      };
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          pythonEnv = mkPythonEnv pkgs;
        in
        {
          default = pkgs.writeShellApplication {
            name = "valsea-twilio-bridge";
            runtimeInputs = [
              pythonEnv
              pkgs.espeak-ng
              pkgs.ffmpeg-headless
            ];
            text = ''
              if [ ! -f main.py ]; then
                echo "Run this from the Valsea project root so main.py and .env can be found." >&2
                exit 1
              fi

              export PYTHONPATH="$PWD:''${PYTHONPATH:-}"
              exec uvicorn main:app --host "''${HOST:-0.0.0.0}" --port "''${PORT:-8000}" "$@"
            '';
          };
          cloudflare-tunnel = pkgs.writeShellApplication {
            name = "valsea-cloudflare-tunnel";
            runtimeInputs = [
              pythonEnv
              pkgs.cloudflared
              pkgs.espeak-ng
              pkgs.ffmpeg-headless
            ];
            text = ''
              if [ ! -f main.py ]; then
                echo "Run this from the Valsea project root so main.py and .env can be found." >&2
                exit 1
              fi

              export PYTHONPATH="$PWD:''${PYTHONPATH:-}"
              exec python run_cloudflare_tunnel.py "$@"
            '';
          };
        });

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/valsea-twilio-bridge";
          meta.description = "Run the FastAPI Twilio/Valsea bridge with uvicorn";
        };
        tunnel = {
          type = "app";
          program = "${self.packages.${system}.cloudflare-tunnel}/bin/valsea-cloudflare-tunnel";
          meta.description = "Run the bridge behind a temporary Cloudflare Tunnel and print/configure the Twilio webhook";
        };
      });

      checks = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          pythonEnv = mkPythonEnv pkgs;
          cleanSource = mkCleanSource pkgs;
        in
        {
          default = pkgs.runCommand "valsea-bridge-check" { nativeBuildInputs = [ pythonEnv ]; } ''
            cp -r ${cleanSource} source
            chmod -R u+w source
            cd source
            python -m py_compile main.py twilio_utils.py valsea_adapter.py configure_twilio_number.py run_cloudflare_tunnel.py
            python - <<'PY'
            from twilio_utils import public_base_url_to_http_url, public_base_url_to_ws_url
            from valsea_adapter import ValseaAdapter, is_probably_silence

            assert public_base_url_to_ws_url("https://example.com") == "wss://example.com/twilio/media-stream"
            assert public_base_url_to_ws_url("http://example.com") == "ws://example.com/twilio/media-stream"
            assert public_base_url_to_http_url("https://example.com") == "https://example.com/twilio/inbound"
            assert public_base_url_to_http_url("example.com") == "https://example.com/twilio/inbound"

            adapter = ValseaAdapter(api_key="test")
            assert not adapter.should_accept_transcript("yeah")
            assert not adapter.should_accept_transcript("hello")
            assert adapter.should_accept_transcript("gel manicure")
            assert not adapter.should_accept_transcript("gel manicure")
            assert adapter.should_accept_transcript("my name is Yves")
            assert is_probably_silence(bytes([0xff]) * 8000)
            PY
            touch "$out"
          '';
        });

      devShells = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          pythonEnv = mkPythonEnv pkgs;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pythonEnv
              pkgs.python312Packages.pip
              pkgs.python312Packages.virtualenv
              pkgs.cloudflared
              pkgs.espeak-ng
              pkgs.ffmpeg-headless
            ];

            shellHook = ''
              echo "FastAPI Twilio/Valsea bridge dev shell"
              echo "Run: python -m venv .venv && source .venv/bin/activate"
              echo "Then: pip install -r requirements.txt"
              echo "Or run directly with: nix run ."
            '';
          };
        });
    };
}
