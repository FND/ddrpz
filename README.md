Dead Drop Zone (DDRPZ)
======================

content-agnostic single-user, multi-application internet storage


Demo
----

*   ensure [Deno](https://deno.com) is installed

*   create `server.js`:

    ```javascript
    import requestHandler from "./src/server/http.js";

    let ENV = Deno.env;
    ENV.set("DDRPZ_sample", "abc123");
    ENV.set("DDRPZ_CORS_sample", "http://localhost:8888/");

    Deno.serve(requestHandler);
    ```

*   `deno --allow-env --allow-net --import-map ./deno.json ./server.js` starts
    the server at http://0.0.0.0:8000

*   navigate to any HTML page being served at http://0.0.0.0:8000, then make
    HTTP requests via the developer console:

    ```javascript
    fetch("http://0.0.0.0:8000/sample", {
        method: "GET",
        headers: {
            Authorization: "Bearer abc123"
        }
    });

    fetch("http://0.0.0.0:8000/sample", {
        method: "PUT",
        headers: {
            Authorization: "Bearer abc123",
            "If-None-Match": "*"
        },
        body: new TextEncoder().encode("lörεm ipsüm dølœr\nßit ämзt")
    });
    ```


Contributing
------------

*   ensure your editor supports [EditorConfig](https://editorconfig.org)

*   ensure [Deno](https://deno.com) is installed

*   `deno task vet` checks code for stylistic consistency

    `deno fmt` can be used to automatically format code

*   `./bin/check` performs static type checking

*   `./bin/test` runs the test suites for both server and client (optionally
    with `--parallel` or `--watch`)
