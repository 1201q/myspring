package com.example.permitmap.business.exception;

public class InvalidBusinessQueryException extends RuntimeException {
    public InvalidBusinessQueryException() {
        super("page는 0 이상, size는 1부터 100까지 입력해야 합니다.");
    }
}
